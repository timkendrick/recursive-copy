'use strict';

var fs = require('node:fs');
var path = require('node:path');
var EventEmitter = require('node:events');
var junk = require('junk');
var errno = require('errno');
var maximatch = require('maximatch');
var slash = require('slash');

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

var mkdirp = path => fs.promises.mkdir(path, { recursive: true });
var mkdir = mkdirp;
var stat = fs.promises.stat;
var lstat = fs.promises.lstat;
var readlink = fs.promises.readlink;
var symlink = fs.promises.symlink;
var readdir = fs.promises.readdir;
var remove = path => fs.promises.rm(path, { recursive: true, force: true });

module.exports = function(src, dest, options, callback) {
	if ((arguments.length === 3) && (typeof options === 'function')) {
		callback = options;
		options = undefined;
	}
	options = options || {};

	var parentDirectory = path.dirname(dest);
	var shouldExpandSymlinks = Boolean(options.expand);

	var emitter;
	var hasFinished = false;
	if (options.debug) { log('Ensuring output directory exists…'); }
	var promise = ensureDirectoryExists(parentDirectory)
		.then(function() {
			if (options.debug) { log('Fetching source paths…'); }
			return getFilePaths(src, shouldExpandSymlinks)
		})
		.then(function(filePaths) {
			if (options.debug) { log('Filtering source paths…'); }
			var relativePaths = filePaths.map(function(filePath) {
				return path.relative(src, filePath);
			});
			var filteredPaths = getFilteredPaths(relativePaths, options.filter, {
				dot: options.dot,
				junk: options.junk
			});
			return filteredPaths.map(function(relativePath) {
				var inputPath = relativePath;
				var outputPath = options.rename ? options.rename(inputPath) : inputPath;
				return {
					src: path.join(src, inputPath),
					dest: path.join(dest, outputPath)
				};
			})
		})
		.then(function(operations) {
			if (options.debug) { log('Copying files…'); }
			var hasFinishedGetter = function() { return hasFinished; };
			var emitEvent = function() { emitter.emit.apply(emitter, arguments); };
			return batch(operations, function(operation) {
				return copy(operation.src, operation.dest, hasFinishedGetter, emitEvent, options);
			}, {
				results: options.results !== false,
				concurrency: options.concurrency || 255
			});
		})
		.catch(function(error) {
			if (options.debug) { log('Copy failed'); }
			if (error instanceof CopyError) {
				emitter.emit(EVENT_ERROR, error.error, error.data);
				throw error.error;
			} else {
				throw error;
			}
		})
		.then(function(results) {
			if (options.debug) { log('Copy complete'); }
			emitter.emit(EVENT_COMPLETE, results);
			return results;
		})
		.then(function(results) {
			hasFinished = true;
			return results;
		})
		.catch(function(error) {
			hasFinished = true;
			throw error;
		});

	if (typeof callback === 'function') {
		promise.then(function(results) {
			callback(null, results);
		})
		.catch(function(error) {
			callback(error);
		});
		emitter = new EventEmitter();
	} else {
		emitter = withEventEmitter(promise);
	}

	return emitter;
};

function batch(inputs, iteratee, options) {
	var results = options.results ? [] : undefined;
	if (inputs.length === 0) { return Promise.resolve(results); }
	return new Promise(function(resolve, reject) {
		var currentIndex = -1;
		var activeWorkers = 0;
		while (currentIndex < Math.min(inputs.length, options.concurrency) - 1) {
			startWorker(inputs[++currentIndex]);
		}

		function startWorker(input) {
			++activeWorkers;
			iteratee(input).then(function(result) {
				--activeWorkers;
				if (results) { results.push(result); }
				if (currentIndex < inputs.length - 1) {
					startWorker(inputs[++currentIndex]);
				} else if (activeWorkers === 0) {
					resolve(results);
				}
			}).catch(reject);
		}
	});
}

async function getFilePaths(src, shouldExpandSymlinks) {
	const method = shouldExpandSymlinks ? stat : lstat
	const stats = await method(src)

	if (stats.isDirectory()) {
		const filenames = await getFileListing(src, shouldExpandSymlinks)
		return [src, ...filenames];
	} else {
		return [src];
	}
}

function getFilteredPaths(paths, filter, options) {
	var useDotFilter = !options.dot;
	var useJunkFilter = !options.junk;
	if (!filter && !useDotFilter && !useJunkFilter) { return paths; }
	return paths.filter(function(path) {
		return (!useDotFilter || dotFilter(path)) && (!useJunkFilter || junkFilter(path)) && (!filter || (maximatch(slash(path), filter, options).length > 0));
	});
}

function dotFilter(relativePath) {
	var filename = path.basename(relativePath);
	return filename.charAt(0) !== '.';
}

function junkFilter(relativePath) {
	var filename = path.basename(relativePath);
	return !junk.is(filename);
}

function ensureDirectoryExists(path) {
	return mkdir(path);
}

async function getFileListing(srcPath, shouldExpandSymlinks) {
	const method = shouldExpandSymlinks ? stat : lstat;
	const filenames = await readdir(srcPath);
	const arrays = await Promise.all(
		filenames.map(async function(filename) {
			const filePath = path.join(srcPath, filename);
			const stats = await method(filePath);

			if (stats.isDirectory()) {
				const childPaths = await getFileListing(filePath, shouldExpandSymlinks);
				return [filePath, ...childPaths];
			} else {
				return [filePath];
			}
		})
	);

	return arrays.flat();
}

async function copy(srcPath, destPath, hasFinished, emitEvent, options) {
	if (options.debug) { log('Preparing to copy ' + srcPath + '…'); }
	return prepareForCopy(srcPath, destPath, options)
		.then(function(stats) {
			if (options.debug) { log('Copying ' + srcPath + '…'); }
			var copyFunction = getCopyFunction(stats, hasFinished, emitEvent);
			return copyFunction(srcPath, destPath, stats, options);
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
		})
		.then(function(result) {
			if (options.debug) { log('Copied ' + srcPath); }
			return result;
		});
}

async function prepareForCopy(srcPath, destPath, options) {
	const method = (options.expand ? stat : lstat)
	const shouldOverwriteExistingFiles = Boolean(options.overwrite);
	const stats = await method(srcPath)

	await ensureDestinationIsWritable(destPath, stats, shouldOverwriteExistingFiles);
	return stats;
}

async function ensureDestinationIsWritable(destPath, srcStats, shouldOverwriteExistingFiles) {
	return lstat(destPath)
		.catch(function(error) {
			var shouldIgnoreError = error.code === 'ENOENT';
			if (shouldIgnoreError) { return null; }
			throw error;
		})
		.then(function(destStats) {
			if (!destStats) { return true; }

			var isMergePossible = srcStats.isDirectory() && destStats.isDirectory();
			if (isMergePossible) { return true; }

			if (shouldOverwriteExistingFiles) {
				return remove(destPath).then(() => true);
			} else {
				throw fsError('EEXIST', destPath);
			}
		});
}

function getCopyFunction(stats, hasFinished, emitEvent) {
	if (stats.isDirectory()) {
		return createCopyFunction(copyDirectory, stats, hasFinished, emitEvent, {
			startEvent: EVENT_CREATE_DIRECTORY_START,
			completeEvent: EVENT_CREATE_DIRECTORY_COMPLETE,
			errorEvent: EVENT_CREATE_DIRECTORY_ERROR
		});
	} else if (stats.isSymbolicLink()) {
		return createCopyFunction(copySymlink, stats, hasFinished, emitEvent, {
			startEvent: EVENT_CREATE_SYMLINK_START,
			completeEvent: EVENT_CREATE_SYMLINK_COMPLETE,
			errorEvent: EVENT_CREATE_SYMLINK_ERROR
		});
	} else {
		return createCopyFunction(copyFile, stats, hasFinished, emitEvent, {
			startEvent: EVENT_COPY_FILE_START,
			completeEvent: EVENT_COPY_FILE_COMPLETE,
			errorEvent: EVENT_COPY_FILE_ERROR
		});
	}
}

function createCopyFunction(fn, stats, hasFinished, emitEvent, events) {
	var startEvent = events.startEvent;
	var completeEvent = events.completeEvent;
	var errorEvent = events.errorEvent;
	return function(srcPath, destPath, stats, options) {
		// Multiple chains of promises are fired in parallel,
		// so when one fails we need to prevent any future
		// copy operations
		if (hasFinished()) { return Promise.reject(); }
		var metadata = {
			src: srcPath,
			dest: destPath,
			stats: stats
		};
		emitEvent(startEvent, metadata);
		var parentDirectory = path.dirname(destPath);
		return ensureDirectoryExists(parentDirectory)
			.then(function() {
				return fn(srcPath, destPath, stats, options);
			})
			.then(function() {
				if (!hasFinished()) { emitEvent(completeEvent, metadata); }
				return metadata;
			})
			.catch(function(error) {
				if (!hasFinished()) { emitEvent(errorEvent, error, metadata); }
				throw error;
			});
	};
}

function copyFile(srcPath, destPath, stats, options) {
	return new Promise(function(resolve, reject) {
		var hasFinished = false;

		var read = fs.createReadStream(srcPath);
		read.on('error', handleCopyFailed);

		var write = fs.createWriteStream(destPath, {
			flags: 'w',
			mode: stats.mode
		});
		write.on('error', handleCopyFailed);
		write.on('finish', function() {
			fs.utimes(destPath, stats.atime, stats.mtime, function() {
				hasFinished = true;
				resolve();
			});
		});

		var transformStream = null;
		if (options.transform) {
			transformStream = options.transform(srcPath, destPath, stats);
			if (transformStream) {
				transformStream.on('error', handleCopyFailed);
				read.pipe(transformStream).pipe(write);
			} else {
				read.pipe(write);
			}
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
			return reject(error);
		}
	});
}

function copySymlink(srcPath, destPath, stats, options) {
	return readlink(srcPath)
		.then(function(link) {
			return symlink(link, destPath);
		});
}

function copyDirectory(srcPath, destPath, stats, options) {
	return mkdir(destPath)
		.catch(function(error) {
			var shouldIgnoreError = error.code === 'EEXIST';
			if (shouldIgnoreError) { return; }
			throw error;
		});
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

function log(message) {
	process.stdout.write(message + '\n');
}

function withEventEmitter(target) {
	for (var key in EventEmitter.prototype) {
		target[key] = EventEmitter.prototype[key];
	}
	EventEmitter.call(target);
	return target;
}

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
