'use strict';

var fs = require('fs');
var path = require('path');
var chai = require('chai');
var expect = chai.expect;
var chaiAsPromised = require('chai-as-promised');
var del = require('del');
var Promise = require('promise');
var readDirFiles = require('read-dir-files');
var through = require('through2');

var copy = require('../../index');

var SOURCE_PATH = path.resolve(__dirname, '../fixtures/source');
var DESTINATION_PATH = path.resolve(__dirname, '../fixtures/destination');

chai.use(chaiAsPromised);

describe('copy()', function() {
	before(function() {
		try {
			fs.mkdirSync(DESTINATION_PATH);
		} catch (error) {
			del.sync(path.join(DESTINATION_PATH, '**/*'), {
				dot: true,
				force: true
			});
		}
	});

	beforeEach(function() {
		try {
			fs.mkdirSync(DESTINATION_PATH);
		} catch (error) {
			del.sync(path.join(DESTINATION_PATH, '**/*'), {
				dot: true,
				force: true
			});
		}
	});

	afterEach(function() {
		del.sync(path.join(DESTINATION_PATH, '**/*'), {
			dot: true,
			force: true
		});
	});

	after(function() {
		del.sync(path.join(DESTINATION_PATH, '**/*'), {
			dot: true,
			force: true
		});
		fs.rmdirSync(DESTINATION_PATH);
	});

	function getSourcePath(filename) {
		return path.join(SOURCE_PATH, filename);
	}

	function getDestinationPath(filename) {
		if (!filename) { return DESTINATION_PATH; }
		return path.join(DESTINATION_PATH, filename);
	}

	function getOutputFiles() {
		return new Promise(function(resolve, reject) {
			readDirFiles.read(DESTINATION_PATH, 'utf8', function(error, files) {
				if (error) {
					return reject(error);
				}
				return resolve(files);
			});
		});
	}

	function checkResults(results, expectedFilenames) {
		var actual, expected;
		actual = results.reduce(function(files, file) {
			files[file.src] = file.dest;
			return files;
		}, {});
		expected = expectedFilenames.map(function(filename) {
			return {
				src: getSourcePath(path.join(filename)),
				dest: getDestinationPath(filename)
			};
		}).reduce(function(files, file) {
			files[file.src] = file.dest;
			return files;
		}, {});
		expect(actual).to.eql(expected);

		results.forEach(function(file) {
			expected = 'function';
			actual = file.stats && file.stats.isDirectory;
			expect(actual).to.be.a(expected);
		});
	}

	describe('basic operation', function() {
		it('should copy single files', function() {
			return copy(
				getSourcePath('file'),
				getDestinationPath('file')
			).then(function(results) {
				return getOutputFiles()
					.then(function(files) {
						var actual, expected;
						actual = files;
						expected = {
							file: 'Hello, world!\n'
						};
						expect(actual).to.eql(expected);
					});
			});
		});

		it('should return results for single files', function() {
			return copy(
				getSourcePath('file'),
				getDestinationPath('file')
			).then(function(results) {
				checkResults(results, [
					'file'
				]);
			});
		});

		it('should copy empty directories', function() {
			return copy(
				getSourcePath('empty'),
				getDestinationPath('empty')
			).then(function(results) {
				return getOutputFiles()
					.then(function(files) {
						var actual, expected;
						actual = files;
						expected = {
							'empty': {}
						};
						expect(actual).to.eql(expected);
					});
			});
		});

		it('should return results for empty directories', function() {
			return copy(
				getSourcePath('empty'),
				getDestinationPath('empty')
			).then(function(results) {
				checkResults(results, [
					'empty'
				]);
			});
		});

		it('should copy directories', function() {
			return copy(
				getSourcePath('directory'),
				getDestinationPath('directory')
			).then(function(results) {
				return getOutputFiles()
					.then(function(files) {
						var actual, expected;
						actual = files;
						expected = {
							'directory': {
								'1': {
									'1-1': {
										'1-1-a': '1-1-a\n',
										'1-1-b': '1-1-b\n'
									},
									'1-2': {
										'1-2-a': '1-2-a\n',
										'1-2-b': '1-2-b\n'
									},
									'1-a': '1-a\n',
									'1-b': '1-b\n'
								},
								'2': {
									'2-1': {
										'2-1-a': '2-1-a\n',
										'2-1-b': '2-1-b\n'
									},
									'2-2': {
										'2-2-a': '2-2-a\n',
										'2-2-b': '2-2-b\n'
									},
									'2-a': '2-a\n',
									'2-b': '2-b\n'
								},
								'a': 'a\n',
								'b': 'b\n'
							}
						};
						expect(actual).to.eql(expected);
					});
			});
		});

		it('should return results for directories', function() {
			return copy(
				getSourcePath('directory'),
				getDestinationPath('directory')
			).then(function(results) {
				checkResults(results, [
					'directory',
					'directory/1',
					'directory/1/1-1',
					'directory/1/1-1/1-1-a',
					'directory/1/1-1/1-1-b',
					'directory/1/1-2',
					'directory/1/1-2/1-2-a',
					'directory/1/1-2/1-2-b',
					'directory/1/1-a',
					'directory/1/1-b',
					'directory/2',
					'directory/2/2-1',
					'directory/2/2-1/2-1-a',
					'directory/2/2-1/2-1-b',
					'directory/2/2-2',
					'directory/2/2-2/2-2-a',
					'directory/2/2-2/2-2-b',
					'directory/2/2-a',
					'directory/2/2-b',
					'directory/a',
					'directory/b'
				]);
			});
		});

		it('should merge directories into existing directories', function() {
			return copy(
				getSourcePath('directory'),
				getDestinationPath()
			).then(function(results) {
				return getOutputFiles()
					.then(function(files) {
						var actual, expected;
						actual = files;
						expected = {
							'1': {
								'1-1': {
									'1-1-a': '1-1-a\n',
									'1-1-b': '1-1-b\n'
								},
								'1-2': {
									'1-2-a': '1-2-a\n',
									'1-2-b': '1-2-b\n'
								},
								'1-a': '1-a\n',
								'1-b': '1-b\n'
							},
							'2': {
								'2-1': {
									'2-1-a': '2-1-a\n',
									'2-1-b': '2-1-b\n'
								},
								'2-2': {
									'2-2-a': '2-2-a\n',
									'2-2-b': '2-2-b\n'
								},
								'2-a': '2-a\n',
								'2-b': '2-b\n'
							},
							'a': 'a\n',
							'b': 'b\n'
						};
						expect(actual).to.eql(expected);
					});
			});
		});

		it('should copy symlinks', function() {
			return copy(
				getSourcePath('symlink'),
				getDestinationPath('symlink')
			).then(function(results) {
				var actual, expected;
				actual = fs.readlinkSync(getDestinationPath('symlink'));
				expected = '.';
				expect(actual).to.equal(expected);
			});
		});

		it('should return results for symlinks', function() {
			return copy(
				getSourcePath('symlink'),
				getDestinationPath('symlink')
			).then(function(results) {
				checkResults(results, ['symlink']);
			});
		});

		it('should copy nested symlinks', function() {
			return copy(
				getSourcePath('nested-symlink'),
				getDestinationPath('nested-symlink')
			).then(function(results) {
				var actual, expected;
				actual = fs.readlinkSync(getDestinationPath('nested-symlink/symlink'));
				expected = '.';
				expect(actual).to.equal(expected);
			});
		});

		it('should return results for symlinks', function() {
			return copy(
				getSourcePath('nested-symlink'),
				getDestinationPath('nested-symlink')
			).then(function(results) {
				checkResults(results, [
					'nested-symlink',
					'nested-symlink/symlink'
				]);
			});
		});
	});

	describe('options', function() {

		it('should overwrite destination path if overwrite is specified', function() {
			fs.writeFileSync(getDestinationPath('file'), '');

			return copy(
				getSourcePath('file'),
				getDestinationPath('file'),
				{
					overwrite: true
				}
			).then(function(results) {
				return getOutputFiles()
					.then(function(files) {
						var actual, expected;
						actual = files;
						expected = {
							file: 'Hello, world!\n'
						};
						expect(actual).to.eql(expected);
					});
			});
		});

		it('should not copy dotfiles if dotfiles is not specified', function() {
			return copy(
				getSourcePath('dotfiles'),
				getDestinationPath()
			).then(function(results) {
				return getOutputFiles()
					.then(function(files) {
						var actual, expected;
						actual = files;
						expected = {
							'a': 'a\n',
							'b': 'b\n'
						};
						expect(actual).to.eql(expected);
					});
			});
		});

		it('should copy dotfiles if dotfiles is specified', function() {
			return copy(
				getSourcePath('dotfiles'),
				getDestinationPath(),
				{
					dot: true
				}
			).then(function(results) {
				return getOutputFiles()
					.then(function(files) {
						var actual, expected;
						actual = files;
						expected = {
							'.a': '.a\n',
							'.b': '.b\n',
							'a': 'a\n',
							'b': 'b\n'
						};
						expect(actual).to.eql(expected);
					});
			});
		});

		it('should not copy junk files if junk is not specified', function() {
			return copy(
				getSourcePath('junk'),
				getDestinationPath()
			).then(function(results) {
				return getOutputFiles()
					.then(function(files) {
						var actual, expected;
						actual = files;
						expected = {
							'a': 'a\n',
							'b': 'b\n'
						};
						expect(actual).to.eql(expected);
					});
			});
		});

		it('should copy junk files if junk is specified', function() {
			return copy(
				getSourcePath('junk'),
				getDestinationPath(),
				{
					junk: true
				}
			).then(function(results) {
				return getOutputFiles()
					.then(function(files) {
						var actual, expected;
						actual = files;
						expected = {
							'a': 'a\n',
							'b': 'b\n',
							'Icon': 'Icon\n',
							'Thumbs.db': 'Thumbs.db\n'
						};
						expect(actual).to.eql(expected);
					});
			});
		});

	});

	describe('output transformation', function() {
		it('should filter output files via function', function() {
			return copy(
				getSourcePath('directory'),
				getDestinationPath(),
				{
					filter: function(filePath) {
						var filename = path.basename(filePath);
						return (filePath === '1') || (filename.charAt(0) !== '1');
					}
				}
			).then(function(results) {
				return getOutputFiles()
					.then(function(files) {
						var actual, expected;
						actual = files;
						expected = {
							'1': {},
							'2': {
								'2-1': {
									'2-1-a': '2-1-a\n',
									'2-1-b': '2-1-b\n'
								},
								'2-2': {
									'2-2-a': '2-2-a\n',
									'2-2-b': '2-2-b\n'
								},
								'2-a': '2-a\n',
								'2-b': '2-b\n'
							},
							'a': 'a\n',
							'b': 'b\n'
						};
						expect(actual).to.eql(expected);
					});
			});
		});

		it('should filter output files via regular expression', function() {
			return copy(
				getSourcePath('directory'),
				getDestinationPath(),
				{
					filter: /(^[^1].*$)|(^1$)/
				}
			).then(function(results) {
				return getOutputFiles()
					.then(function(files) {
						var actual, expected;
						actual = files;
						expected = {
							'1': {},
							'2': {
								'2-1': {
									'2-1-a': '2-1-a\n',
									'2-1-b': '2-1-b\n'
								},
								'2-2': {
									'2-2-a': '2-2-a\n',
									'2-2-b': '2-2-b\n'
								},
								'2-a': '2-a\n',
								'2-b': '2-b\n'
							},
							'a': 'a\n',
							'b': 'b\n'
						};
						expect(actual).to.eql(expected);
					});
			});
		});

		it('should filter output files via glob', function() {
			return copy(
				getSourcePath('directory'),
				getDestinationPath(),
				{
					filter: '!1/**/*'
				}
			).then(function(results) {
				return getOutputFiles()
					.then(function(files) {
						var actual, expected;
						actual = files;
						expected = {
							'1': {},
							'2': {
								'2-1': {
									'2-1-a': '2-1-a\n',
									'2-1-b': '2-1-b\n'
								},
								'2-2': {
									'2-2-a': '2-2-a\n',
									'2-2-b': '2-2-b\n'
								},
								'2-a': '2-a\n',
								'2-b': '2-b\n'
							},
							'a': 'a\n',
							'b': 'b\n'
						};
						expect(actual).to.eql(expected);
					});
			});
		});

		it('should combine multiple filters from arrays', function() {
			return copy(
				getSourcePath('directory'),
				getDestinationPath(),
				{
					filter: [
						'!1/**/*',
						/^[^b].*$/,
						function(filePath) {
							return !/^2\/2-1\//.test(filePath);
						}
					]
				}
			).then(function(results) {
				return getOutputFiles()
					.then(function(files) {
						var actual, expected;
						actual = files;
						expected = {
							'1': {},
							'2': {
								'2-1': {
								},
								'2-2': {
									'2-2-a': '2-2-a\n',
									'2-2-b': '2-2-b\n'
								},
								'2-a': '2-a\n',
								'2-b': '2-b\n'
							},
							'a': 'a\n'
						};
						expect(actual).to.eql(expected);
					});
			});
		});

		it('should rename files', function() {
			return copy(
				getSourcePath('directory'),
				getDestinationPath(),
				{
					rename: function(path) {
						if (path === 'b') { return 'c'; }
						return path;
					}
				}
			).then(function(results) {
				return getOutputFiles()
					.then(function(files) {
						var actual, expected;
						actual = files;
						expected = {
							'1': {
								'1-1': {
									'1-1-a': '1-1-a\n',
									'1-1-b': '1-1-b\n'
								},
								'1-2': {
									'1-2-a': '1-2-a\n',
									'1-2-b': '1-2-b\n'
								},
								'1-a': '1-a\n',
								'1-b': '1-b\n'
							},
							'2': {
								'2-1': {
									'2-1-a': '2-1-a\n',
									'2-1-b': '2-1-b\n'
								},
								'2-2': {
									'2-2-a': '2-2-a\n',
									'2-2-b': '2-2-b\n'
								},
								'2-a': '2-a\n',
								'2-b': '2-b\n'
							},
							'a': 'a\n',
							'c': 'b\n'
						};
						expect(actual).to.eql(expected);
					});
			});
		});

		it('should rename file paths', function() {
			return copy(
				getSourcePath('directory'),
				getDestinationPath(),
				{
					rename: function(path) {
						return path.replace(/^2/, '3').replace(/\/2/g, '/3');
					}
				}
			).then(function(results) {
				return getOutputFiles()
					.then(function(files) {
						var actual, expected;
						actual = files;
						expected = {
							'1': {
								'1-1': {
									'1-1-a': '1-1-a\n',
									'1-1-b': '1-1-b\n'
								},
								'1-2': {
									'1-2-a': '1-2-a\n',
									'1-2-b': '1-2-b\n'
								},
								'1-a': '1-a\n',
								'1-b': '1-b\n'
							},
							'3': {
								'3-1': {
									'3-1-a': '2-1-a\n',
									'3-1-b': '2-1-b\n'
								},
								'3-2': {
									'3-2-a': '2-2-a\n',
									'3-2-b': '2-2-b\n'
								},
								'3-a': '2-a\n',
								'3-b': '2-b\n'
							},
							'a': 'a\n',
							'b': 'b\n'
						};
						expect(actual).to.eql(expected);
					});
			});
		});

		it('should rename files into parent paths', function() {
			return copy(
				getSourcePath('directory'),
				getDestinationPath('parent'),
				{
					rename: function(path) {
						return path.replace(/^2/, '../3').replace(/\/2/g, '/3');
					}
				}
			).then(function(results) {
				return getOutputFiles()
					.then(function(files) {
						var actual, expected;
						actual = files;
						expected = {
							'parent': {
								'1': {
									'1-1': {
										'1-1-a': '1-1-a\n',
										'1-1-b': '1-1-b\n'
									},
									'1-2': {
										'1-2-a': '1-2-a\n',
										'1-2-b': '1-2-b\n'
									},
									'1-a': '1-a\n',
									'1-b': '1-b\n'
								},
								'a': 'a\n',
								'b': 'b\n'
							},
							'3': {
								'3-1': {
									'3-1-a': '2-1-a\n',
									'3-1-b': '2-1-b\n'
								},
								'3-2': {
									'3-2-a': '2-2-a\n',
									'3-2-b': '2-2-b\n'
								},
								'3-a': '2-a\n',
								'3-b': '2-b\n'
							}
						};
						expect(actual).to.eql(expected);
					});
			});
		});

		it('should rename files into child paths', function() {
			return copy(
				getSourcePath('directory'),
				getDestinationPath(),
				{
					rename: function(path) {
						return path.replace(/^2/, 'child/3').replace(/\/2/g, '/3');
					}
				}
			).then(function(results) {
				return getOutputFiles()
					.then(function(files) {
						var actual, expected;
						actual = files;
						expected = {
							'1': {
								'1-1': {
									'1-1-a': '1-1-a\n',
									'1-1-b': '1-1-b\n'
								},
								'1-2': {
									'1-2-a': '1-2-a\n',
									'1-2-b': '1-2-b\n'
								},
								'1-a': '1-a\n',
								'1-b': '1-b\n'
							},
							'a': 'a\n',
							'b': 'b\n',
							'child': {
								'3': {
									'3-1': {
										'3-1-a': '2-1-a\n',
										'3-1-b': '2-1-b\n'
									},
									'3-2': {
										'3-2-a': '2-2-a\n',
										'3-2-b': '2-2-b\n'
									},
									'3-a': '2-a\n',
									'3-b': '2-b\n'
								}
							}
						};
						expect(actual).to.eql(expected);
					});
			});
		});

		it('should filter files before renaming', function() {
			return copy(
				getSourcePath('directory'),
				getDestinationPath(),
				{
					filter: function(path) {
						return path === 'a';
					},
					rename: function(path) {
						if (path === 'a') { return 'b'; }
						return path;
					}
				}
			).then(function(results) {
				return getOutputFiles()
					.then(function(files) {
						var actual, expected;
						actual = files;
						expected = {
							'b': 'a\n'
						};
						expect(actual).to.eql(expected);
					});
			});
		});

		it('should transform files', function() {
			return copy(
				getSourcePath('file'),
				getDestinationPath('file'),
				{
					transform: function(src, dest, stats) {
						return through(function(chunk, enc, done) {
							done(null, chunk.toString().toUpperCase());
						});
					}
				}
			).then(function(results) {
				return getOutputFiles()
					.then(function(files) {
						var actual, expected;
						actual = files;
						expected = {
							'file': 'HELLO, WORLD!\n'
						};
						expect(actual).to.eql(expected);
					});
			});
		});

		it('should throw an error on a transform stream error event', function() {
			var actual, expected;
			expected = 'Stream error';
			actual = copy(
				getSourcePath('file'),
				getDestinationPath('file'),
				{
					transform: function(src, dest, stats) {
						return through(function(chunk, enc, done) {
							done(new Error('Stream error'));
						});
					}
				}
			);
			expect(actual).to.be.rejectedWith(expected);
		});
	});

	describe('argument validation', function() {

		it('should throw an error if the source path does not exist', function() {
			var actual, expected;
			actual = copy(
				'nonexistent',
				getDestinationPath()
			);
			expected = 'ENOENT';
			return expect(actual).to.be.rejectedWith(expected);
		});

		it('should throw an error if the destination path exists (single file)', function() {
			fs.writeFileSync(getDestinationPath('file'), '');

			var actual, expected;
			actual = copy(
				getSourcePath('file'),
				getDestinationPath('file')
			);
			expected = 'EEXIST';
			return expect(actual).to.be.rejectedWith(expected);
		});

		it('should not throw an error if an nonconflicting file exists within the destination path (single file)', function() {
			fs.writeFileSync(getDestinationPath('pre-existing'), '');

			return copy(
				getSourcePath('file'),
				getDestinationPath('file')
			).then(function(results) {
				return getOutputFiles()
					.then(function(files) {
						var actual, expected;
						actual = files;
						expected = {
							'pre-existing': '',
							'file': 'Hello, world!\n'
						};
						expect(actual).to.eql(expected);
					});
			});
		});

		it('should throw an error if a conflicting file exists within the destination path (directory)', function() {
			fs.writeFileSync(getDestinationPath('a'), '');

			var actual, expected;
			actual = copy(
				getSourcePath('directory'),
				getDestinationPath()
			);
			expected = 'EEXIST';
			return expect(actual).to.be.rejectedWith(expected);
		});

		it('should not throw an error if an nonconflicting file exists within the destination path (directory)', function() {
			fs.writeFileSync(getDestinationPath('pre-existing'), '');

			return copy(
				getSourcePath('directory'),
				getDestinationPath()
			).then(function(results) {
				return getOutputFiles()
					.then(function(files) {
						var actual, expected;
						actual = files;
						expected = {
							'pre-existing': '',
							'1': {
								'1-1': {
									'1-1-a': '1-1-a\n',
									'1-1-b': '1-1-b\n'
								},
								'1-2': {
									'1-2-a': '1-2-a\n',
									'1-2-b': '1-2-b\n'
								},
								'1-a': '1-a\n',
								'1-b': '1-b\n'
							},
							'2': {
								'2-1': {
									'2-1-a': '2-1-a\n',
									'2-1-b': '2-1-b\n'
								},
								'2-2': {
									'2-2-a': '2-2-a\n',
									'2-2-b': '2-2-b\n'
								},
								'2-a': '2-a\n',
								'2-b': '2-b\n'
							},
							'a': 'a\n',
							'b': 'b\n'
						};
						expect(actual).to.eql(expected);
					});
			});
		});
	});

	describe('callbacks', function() {
		it('should invoke the callback on success (without options)', function(done) {
			copy(
				getSourcePath('file'),
				getDestinationPath('file'),
				function(error, results) {
					expect(results).to.exist;
					expect(error).not.to.exist;

					checkResults(results, [
						'file'
					]);

					done();
				}
			);
		});

		it('should invoke the callback on failure (without options)', function(done) {
			copy(
				'nonexistent',
				getDestinationPath(),
				function(error, results) {
					expect(error).to.exist;
					expect(results).not.to.exist;

					var actual, expected;
					actual = function() { throw error; };
					expected = 'ENOENT';
					expect(actual).to.throw(expected);

					done();
				}
			);
		});

		it('should invoke the callback on success (with options)', function(done) {
			copy(
				getSourcePath('file'),
				getDestinationPath('file'),
				{ },
				function(error, results) {
					expect(results).to.exist;
					expect(error).not.to.exist;

					checkResults(results, [
						'file'
					]);

					done();
				}
			);
		});
		it('should invoke the callback on failure (with options)', function(done) {
			copy(
				'nonexistent',
				getDestinationPath(),
				{},
				function(error, results) {
					expect(error).to.exist;
					expect(results).not.to.exist;

					var actual, expected;
					actual = function() { throw error; };
					expected = 'ENOENT';
					expect(actual).to.throw(expected);

					done();
				}
			);
		});
	});
});
