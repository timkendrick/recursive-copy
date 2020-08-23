import copy from '.';
import {Stream} from 'stream';
import {expectType, expectError} from 'tsd';

copy('source', 'dest')
	.then(() => {})
	.catch(e => {});

// All options should be optional.
copy('source', 'dest', {})
	.then(() => {})
	.catch(e => {});

copy('source', 'dest', {
	overwrite: true,
	expand: true,
	dot: true,
	junk: true,
	rename: (path: string) => 'abc/' + path,
	transform: (src: string, dest: string, stats) => {
		if (stats.isDirectory()) {
			return new Stream();
		} else {
			return new Stream();
		}
	},
	results: true,
	concurrency: 123,
	debug: true,
})
	.then(() => {})
	.catch(e => {});

// Test each 'filter' type.
copy('source', 'dest', {filter: 'abc'});
copy('source', 'dest', {filter: /abc/});
copy('source', 'dest', {filter: ['abc', 'def']});
copy('source', 'dest', {filter: (path) => false});

expectType<Promise<void>>(copy('source', 'dest'));
expectError(copy(123, 'dest'));
expectError(copy('source', 123));
expectError(copy('source', 'dest', 'options'));
