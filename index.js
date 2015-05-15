'use strict';

var fs = require('graceful-fs');
var path = require('path');
var Promise = require('promise');
var extend = require('extend');
var mkdirp = require('mkdirp');
var junk = require('junk');
var errno = require('errno');
var minimatch = require('minimatch');

module.exports = function(src, dest, options, callback) {
	if ((arguments.length === 3) && (typeof options === 'function')) {
		callback = options;
		options = undefined;
	}
	options = options || {};
	options = extend({}, options, {
		filter: getCombinedFilter(options)
	});

	var hasFinished = false;

	var mkdir = wrapFsMethod(mkdirp);
	var stat = wrapFsMethod(fs.stat);
	var lstat = wrapFsMethod(fs.lstat);
	var readlink = wrapFsMethod(fs.readlink);
	var symlink = wrapFsMethod(fs.symlink);
	var readdir = wrapFsMethod(fs.readdir);

	var srcRoot = src;
	var destRoot = dest;
	return copy(src, dest, srcRoot, destRoot, options)
		.then(function(result) {
			return (function getFlattenedResults(result) {
				return [result].concat(
					(result.files || []).map(function(result) {
						return getFlattenedResults(result);
					}).reduce(function(results, result) {
						return results.concat(result);
					}, [])
				);
			})(result);
		})
		.finally(function() {
			hasFinished = true;
		})
		.nodeify(callback);


	function getCombinedFilter(options) {
		var filters = [];
		if (!options.dot) { filters.push(dotFilter); }
		if (!options.junk) { filters.push(junkFilter); }
		if (options.filter) {
			var filter = getFilterFunction(options.filter);
			filters.push(filter);
		}
		return getFilterFunction(filters);


		function dotFilter(relativePath) {
			var filename = path.basename(relativePath);
			return filename.charAt(0) !== '.';
		}

		function junkFilter(relativePath) {
			var filename = path.basename(relativePath);
			return !junk.is(filename);
		}

		function getFilterFunction(filter) {
			if (typeof filter === 'function') {
				return filter;
			} else if (typeof filter === 'string') {
				return createGlobFilter(filter);
			} else if (filter instanceof RegExp) {
				return createRegExpFilter(filter);
			} else if (Array.isArray(filter)) {
				return createArrayFilter(filter);
			} else {
				throw new Error('Invalid filter');
			}


			function createGlobFilter(glob) {
				return function(path) {
					return minimatch(path, glob);
				};
			}

			function createRegExpFilter(pattern) {
				return function(path) {
					return pattern.test(path);
				};
			}

			function createArrayFilter(filters) {
				var filterFunctions = filters.map(function(filter) {
					return getFilterFunction(filter);
				});
				return function(path) {
					return filterFunctions.reduce(function(match, filter) {
						return match && filter(path);
					}, true);
				};
			}
		}
	}

	function wrapFsMethod(fn) {
		var promiser = Promise.denodeify(fn);
		return function() {
			// Multiple chains of promises are fired in parallel,
			// so when one fails we need to prevent any future
			// filesystem operations
			if (hasFinished) { return Promise.reject(); }
			return promiser.apply(null, arguments);
		};
	}

	function copy(srcPath, destPath, srcRoot, destRoot, options) {
		return prepareForCopy(srcPath, destPath, options)
			.then(function(stats) {
				if (stats.isDirectory()) {
					return copyDirectory(srcPath, destPath, srcRoot, destRoot, stats, options);
				} else if (stats.isSymbolicLink()) {
					return copySymbolicLink(srcPath, destPath, srcRoot, destRoot, stats, options);
				} else {
					return copyFile(srcPath, destPath, srcRoot, destRoot, stats, options);
				}
			});


		function prepareForCopy(srcPath, destPath, options) {
			return lstat(srcPath)
				.then(function(stats) {
					return ensureDestinationIsWritable(destPath, options, stats)
						.then(function() {
							return stats;
						});
				});


				function ensureDestinationIsWritable(destPath, options, srcStats) {
					if (options.overwrite) {
						return Promise.resolve(true);
					}
					return stat(destPath)
						.catch(function(error) {
							var shouldIgnoreError = error.code === 'ENOENT';
							if (shouldIgnoreError) { return null; }
							throw error;
						})
						.then(function(destStats) {
							var destExists = Boolean(destStats);
							var isWritable = !destExists || (srcStats.isDirectory() && destStats.isDirectory());
							if (!isWritable) {
								throw fsError('EEXIST', destPath);
							}
							return true;
						});
				}
		}

		function copyFile(srcPath, destPath, srcRoot, destRoot, stats, options) {
			return new Promise(function(resolve, reject) {
				var read = fs.createReadStream(srcPath);
				read.on('error', reject);

				var write = fs.createWriteStream(destPath, { flags: 'w' });
				write.on('error', reject);
				write.on('finish', function() {
					fs.chmod(destPath, stats.mode, function() {
						return resolve({
							src: srcPath,
							dest: destPath,
							stats: stats
						});
					});
				});

				var transformStream = null;
				if (options.transform) {
					transformStream = options.transform(srcPath, destPath, stats);
					transformStream.on('error', reject);
					read.pipe(transformStream).pipe(write);
				} else {
					read.pipe(write);
				}
			});
		}

		function copySymbolicLink(srcPath, destPath, srcRoot, destRoot, stats, options) {
			return readlink(srcPath)
				.then(function(link) {
					return symlink(link, destPath)
						.then(function() {
							return {
								src: srcPath,
								dest: destPath,
								stats: stats
							};
						});
				});
		}

		function copyDirectory(srcPath, destPath, srcRoot, destRoot, stats, options) {
			return mkdir(destPath)
				.catch(function(error) {
					var shouldIgnoreError = error.code === 'EEXIST';
					if (shouldIgnoreError) { return; }
					throw error;
				})
				.then(function() {
					return readdir(srcPath)
						.then(function(filenames) {
							var filePaths = filenames.map(function(filename) {
								return path.join(srcPath, filename);
							});
							return copyFileSet(filePaths, srcRoot, destRoot, options)
								.then(function(files) {
									return {
										src: srcPath,
										dest: destPath,
										stats: stats,
										files: files
									};
								});
						});
				});
		}

		function copyFileSet(filePaths, srcRoot, destRoot, options) {
			var copyOperations = filePaths.map(function(filePath) {
				return path.relative(srcRoot, filePath);
			}).filter(function(relativePath) {
				return options.filter ? options.filter(relativePath) : true;
			}).map(function(relativePath) {
				var inputPath = relativePath;
				var outputPath = options.rename ? options.rename(inputPath) : inputPath;
				return {
					src: path.join(srcRoot, inputPath),
					dest: path.join(destRoot, outputPath)
				};
			});
			return Promise.all(copyOperations.map(function(copyOperation) {
				return copy(copyOperation.src, copyOperation.dest, srcRoot, destRoot, options);
			}));
		}
	}
};

function fsError(code, path) {
	var errorType = errno.code[code];
	var message = errorType.code + ', ' + errorType.description + ' ' + path;
	var error = new Error(message);
	error.errno = errorType.errno;
	error.code = errorType.code;
	error.path = path;
	return error;
}
