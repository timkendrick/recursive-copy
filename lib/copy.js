'use strict';

var fs = require('graceful-fs');
var path = require('path');
var EventEmitter = require('events').EventEmitter;
var Promise = require('promise');
var extend = require('extend');
var mkdirp = require('mkdirp');
var del = require('del');
var junk = require('junk');
var errno = require('errno');
var minimatch = require('minimatch');
var emitterMixin = require('emitter-mixin');

var CopyError = errno.custom.createError('CopyError');

var EVENT_ERROR = 'error';
var EVENT_COMPLETE = 'complete';
var EVENT_CREATE_DIRECTORY_START = 'createDirectoryStart';
var EVENT_CREATE_DIRECTORY_ERROR = 'createDirectoryError';
var EVENT_CREATE_DIRECTORY_COMPLETE = 'createDirectoryComplete';
var EVENT_CREATE_SYMLINK_START = 'createSymlinkStart';
var EVENT_CREATE_SYMLINK_ERROR = 'createSymlinkError';
var EVENT_CREATE_SYMLINK_COMPLETE = 'createSymlinkComplete';
var EVENT_COPY_FILE_START = 'copyFileStart';
var EVENT_COPY_FILE_ERROR = 'copyFileError';
var EVENT_COPY_FILE_COMPLETE = 'copyFileComplete';


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
	var lstat = wrapFsMethod(fs.lstat);
	var readlink = wrapFsMethod(fs.readlink);
	var symlink = wrapFsMethod(fs.symlink);
	var readdir = wrapFsMethod(fs.readdir);
	var chmod = wrapFsMethod(fs.chmod);

	var srcRoot = src;
	var destRoot = dest;
	var parentDirectory = path.dirname(destRoot);

	var emitter;
	var promise = ensureDirectoryExists(parentDirectory)
		.then(function() {
			return copy(src, dest, srcRoot, destRoot, options);
		})
		.then(function(result) {
			return flattenResultsTree(result);
		})
		.catch(function(error) {
			if (error instanceof CopyError) {
				emitEvent(EVENT_ERROR, error.error, error.data);
				throw error.error;
			} else {
				throw error;
			}
		})
		.then(function(results) {
			emitEvent(EVENT_COMPLETE, results);
			return results;
		})
		.finally(function() {
			hasFinished = true;
		});

	if (typeof callback === 'function') {
		promise.nodeify(callback);
		emitter = new EventEmitter();
	} else {
		emitter = emitterMixin(promise);
	}

	return emitter;


	function getCombinedFilter(options) {
		var filters = [];
		if (!options.dot) { filters.push(dotFilter); }
		if (!options.junk) { filters.push(junkFilter); }
		if (options.filter) {
			var filter = getFilterFunction(options.filter, options.dot);
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

		function getFilterFunction(filter, allowDotfiles) {
			if (typeof filter === 'function') {
				return filter;
			} else if (typeof filter === 'string') {
				return createGlobFilter(filter, allowDotfiles);
			} else if (filter instanceof RegExp) {
				return createRegExpFilter(filter);
			} else if (Array.isArray(filter)) {
				return createArrayFilter(filter);
			} else {
				throw new Error('Invalid filter');
			}


			function createGlobFilter(glob, allowDotfiles) {
				return function(path) {
					return minimatch(path, glob, {
						dot: allowDotfiles
					});
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
		// Convert from node-style callbacks to promises
		var wrappedFn = Promise.denodeify(fn);
		return function() {
			// Multiple chains of promises are fired in parallel,
			// so when one fails we need to prevent any future
			// filesystem operations
			if (hasFinished) { return Promise.reject(); }
			return wrappedFn.apply(null, arguments);
		};
	}

	function emitEvent(event, args) {
		if (hasFinished) { return; }
		emitter.emit.apply(emitter, arguments);
	}

	function ensureDirectoryExists(path) {
		return mkdir(path);
	}

	function flattenResultsTree(result) {
		return (result.files || []).reduce(function(results, result) {
			return results.concat(flattenResultsTree(result));
		}, [result]);
	}

	function copy(srcPath, destPath, srcRoot, destRoot, options) {
		return prepareForCopy(srcPath, destPath, options)
			.then(function(stats) {
				if (stats.isDirectory()) {
					return copyDirectory(srcPath, destPath, srcRoot, destRoot, stats, options);
				} else if (stats.isSymbolicLink()) {
					return copySymlink(srcPath, destPath, srcRoot, destRoot, stats, options);
				} else {
					return copyFile(srcPath, destPath, srcRoot, destRoot, stats, options);
				}
			})
			.catch(function(error) {
				if (error instanceof CopyError) {
					throw error;
				}
				var copyError = new CopyError(error.message);
				copyError.error = error;
				copyError.data = {
					src: srcPath,
					dest: destPath
				};
				throw copyError;
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
					return lstat(destPath)
						.catch(function(error) {
							var shouldIgnoreError = error.code === 'ENOENT';
							if (shouldIgnoreError) { return null; }
							throw error;
						})
						.then(function(destStats) {
							var destExists = Boolean(destStats);
							if (!destExists) { return true; }

							var isMergePossible = srcStats.isDirectory() && destStats.isDirectory();
							if (isMergePossible) { return true; }

							if (options.overwrite) {
								return new Promise(function(resolve, reject) {
									del(destPath, {
										force: true
									}, function(error, paths) {
										if (error) { return reject(error); }
										return resolve(true);
									});
								});
							} else {
								throw fsError('EEXIST', destPath);
							}
						});
				}
		}

		function copyFile(srcPath, destPath, srcRoot, destRoot, stats, options) {
			return new Promise(function(resolve, reject) {
				emitEvent(EVENT_COPY_FILE_START, {
					src: srcPath,
					dest: destPath,
					stats: stats
				});
				var hasFinished = false;

				var read = fs.createReadStream(srcPath);
				read.on('error', handleCopyFailed);

				var write = fs.createWriteStream(destPath, { flags: 'w' });
				write.on('error', handleCopyFailed);
				write.on('finish', function() {
					chmod(destPath, stats.mode)
						.then(function() {
							hasFinished = true;
							emitEvent(EVENT_COPY_FILE_COMPLETE, {
								src: srcPath,
								dest: destPath,
								stats: stats
							});
							return resolve({
								src: srcPath,
								dest: destPath,
								stats: stats
							});
						})
						.catch(function(error) {
							return handleCopyFailed(error);
						});
				});

				var transformStream = null;
				if (options.transform) {
					transformStream = options.transform(srcPath, destPath, stats);
					transformStream.on('error', handleCopyFailed);
					read.pipe(transformStream).pipe(write);
				} else {
					read.pipe(write);
				}


				function handleCopyFailed(error) {
					if (hasFinished) { return; }
					hasFinished = true;
					if (typeof read.close === 'function') {
						read.close();
					}
					if (typeof write.close === 'function') {
						write.close();
					}
					emitEvent(EVENT_COPY_FILE_ERROR, error, {
						src: srcPath,
						dest: destPath,
						stats: stats
					});
					return reject(error);
				}
			});
		}

		function copySymlink(srcPath, destPath, srcRoot, destRoot, stats, options) {
			emitEvent(EVENT_CREATE_SYMLINK_START, {
				src: srcPath,
				dest: destPath,
				stats: stats
			});
			return readlink(srcPath)
				.then(function(link) {
					return symlink(link, destPath)
						.then(function() {
							emitEvent(EVENT_CREATE_SYMLINK_COMPLETE, {
								src: srcPath,
								dest: destPath,
								stats: stats
							});
							return {
								src: srcPath,
								dest: destPath,
								stats: stats
							};
						});
				})
				.catch(function(error) {
					emitEvent(EVENT_CREATE_SYMLINK_ERROR, error, {
						src: srcPath,
						dest: destPath,
						stats: stats
					});
					throw error;
				});
		}

		function copyDirectory(srcPath, destPath, srcRoot, destRoot, stats, options) {
			emitEvent(EVENT_CREATE_DIRECTORY_START, {
				src: srcPath,
				dest: destPath,
				stats: stats
			});
			return mkdir(destPath)
				.catch(function(error) {
					var shouldIgnoreError = error.code === 'EEXIST';
					if (shouldIgnoreError) { return; }
					emitEvent(EVENT_CREATE_DIRECTORY_ERROR, error, {
						src: srcPath,
						dest: destPath,
						stats: stats
					});
					throw error;
				})
				.then(function() {
					emitEvent(EVENT_CREATE_DIRECTORY_COMPLETE, {
						src: srcPath,
						dest: destPath,
						stats: stats
					});
					return readdir(srcPath)
						.then(function(filenames) {
							var filePaths = filenames.map(function(filename) {
								return path.join(srcPath, filename);
							});
							return copyFileset(filePaths, srcRoot, destRoot, options)
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

		function copyFileset(filePaths, srcRoot, destRoot, options) {
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

	function fsError(code, path) {
		var errorType = errno.code[code];
		var message = errorType.code + ', ' + errorType.description + ' ' + path;
		var error = new Error(message);
		error.errno = errorType.errno;
		error.code = errorType.code;
		error.path = path;
		return error;
	}
};

module.exports.events = {
	ERROR: EVENT_ERROR,
	COMPLETE: EVENT_COMPLETE,
	CREATE_DIRECTORY_START: EVENT_CREATE_DIRECTORY_START,
	CREATE_DIRECTORY_ERROR: EVENT_CREATE_DIRECTORY_ERROR,
	CREATE_DIRECTORY_COMPLETE: EVENT_CREATE_DIRECTORY_COMPLETE,
	CREATE_SYMLINK_START: EVENT_CREATE_SYMLINK_START,
	CREATE_SYMLINK_ERROR: EVENT_CREATE_SYMLINK_ERROR,
	CREATE_SYMLINK_COMPLETE: EVENT_CREATE_SYMLINK_COMPLETE,
	COPY_FILE_START: EVENT_COPY_FILE_START,
	COPY_FILE_ERROR: EVENT_COPY_FILE_ERROR,
	COPY_FILE_COMPLETE: EVENT_COPY_FILE_COMPLETE
};
