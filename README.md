#recursive-copy [![stable](http://badges.github.io/stability-badges/dist/stable.svg)](http://github.com/badges/stability-badges)

> Simple, flexible file copy utility

## Features

- Choose which files are copied by passing a filter function, regular expression or glob
- Rename files dynamically, including changing the output path
- Transform file contents using streams
- Choose whether to overwrite existing files
- Choose whether to copy system files
- Filters out [junk](https://www.npmjs.com/package/junk) files by default
- Uses [graceful-fs](https://www.npmjs.com/package/graceful-fs) and [mkdirp](https://www.npmjs.com/package/mkdirp) to avoid filesystem errors
- Optional promise-based interface

## Examples

#### Node-style callback interface

```javascript
var copy = require('recursive-copy');

copy('src', 'dest', function(error, results) {
	if (error) {
		console.error('Copy failed: ' + error);
	} else {
		console.info('Copy succeeded');
	}
});
```

#### Promise interface

```javascript
var copy = require('recursive-copy');

copy('src', 'dest')
	.then(function(results) {
		console.info('Copy succeeded');
	})
	.catch(function(error) {
		console.error('Copy failed: ' + error);
	});
});
```

#### Advanced options

```javascript
var copy = require('recursive-copy');

var path = require('path');
var through = require('through2');

var options = {
	overwrite: true,
	dotfiles: true,
	junk: true,
	filter: function(filePath) {
		var filename = path.basename(filePath);
		return filename !== '.htpasswd';
	},
	rename: function(filePath) {
		return filePath + '.orig';
	},
	transform: function(src, dest, cwd, stats) {
		return through(function(chunk, enc, done)  {
			var output = chunk.toString().toUpperCase();
			done(null, output);
		});
	}
};

copy('src', 'dest', options, function(error, results) {
	if (error) {
		return console.error('Copy failed: ' + error);
	}
	var copiedFiles = results.map(function(result) {
		return result.stats.isFile();
	});
	console.info(copiedFiles.length + ' file(s) copied');
});
```


## Usage

### `copy(src, dest, [options], [callback])`

Recursively copy files and folders from `src` to `dest`

Arguments:

| Name | Type | Required | Default | Description |
| ---- | ---- | -------- | ------- | ----------- |
| `src` | `string` | Yes | N/A | Source file/folder path |
| `dest` | `string` | Yes | N/A | Destination file/folder path |
| `options.overwrite` | `boolean` | No | `false` | Whether to overwrite destination files |
| `options.dot` | `boolean` | No | `false` | Whether to copy files beginning with a `.` |
| `options.junk` | `boolean` | No | `false` | Whether to copy OS junk files (e.g. `.DS_Store`, `Thumbs.db`) |
| `options.filter` | `function`, `RegExp`, `string`, `array` | No | `null` | Filter function / regular expression / glob that determines which files to copy |
| `options.rename` | `function` | No | `null` | Function that maps source paths to destination paths |
| `options.transform` | `function` | No | `null` | Function that returns a transform stream used to modify file contents |
| `callback` | `function` | No | `null` | Callback, invoked on success/failure |

Returns:

`Promise<Array>` Promise, fulfilled with array of copy results:

```json
[
	{
		"src": "/path/to/src",
		"dest": "/path/to/dest",
		"stats": <Stats>
	},
	{
		"src": "/path/to/src/file.txt",
		"dest": "/path/to/dest/file.txt",
		"stats": <Stats>
	},
	{
		"src": "/path/to/src/subfolder",
		"dest": "/path/to/dest/subfolder",
		"stats": <Stats>
	},
	{
		"src": "/path/to/src/subfolder/nested.txt",
		"dest": "/path/to/dest/subfolder/nested.txt",
		"stats": <Stats>
	}
]
```
