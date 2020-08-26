import copy, { CopyErrorInfo, CopyEventType, CopyOperation } from '.';
import { Stream } from 'stream';
import { expectError, expectType } from 'tsd';

// Promise interface
copy('source', 'dest')
	.on(copy.events.ERROR, (error, info) => {})
	.on(copy.events.COMPLETE, (info) => {})
	.on(copy.events.CREATE_DIRECTORY_START, (info) => {})
	.on(copy.events.CREATE_DIRECTORY_ERROR, (error, info) => {})
	.on(copy.events.CREATE_DIRECTORY_COMPLETE, (info) => {})
	.on(copy.events.CREATE_SYMLINK_START, (info) => {})
	.on(copy.events.CREATE_SYMLINK_ERROR, (error, info) => {})
	.on(copy.events.CREATE_SYMLINK_COMPLETE, (info) => {})
	.on(copy.events.COPY_FILE_START, (info) => {})
	.on(copy.events.COPY_FILE_ERROR, (error, info) => {})
	.on(copy.events.COPY_FILE_COMPLETE, (info) => {})
	.then(() => {})
	.catch(e => {});

// Callback interface
copy('source', 'dest', (error, results) => {})
	.on(copy.events.ERROR, (error, info) => {})
	.on(copy.events.COMPLETE, (info) => {})
	.on(copy.events.CREATE_DIRECTORY_START, (info) => {})
	.on(copy.events.CREATE_DIRECTORY_ERROR, (error, info) => {})
	.on(copy.events.CREATE_DIRECTORY_COMPLETE, (info) => {})
	.on(copy.events.CREATE_SYMLINK_START, (info) => {})
	.on(copy.events.CREATE_SYMLINK_ERROR, (error, info) => {})
	.on(copy.events.CREATE_SYMLINK_COMPLETE, (info) => {})
	.on(copy.events.COPY_FILE_START, (info) => {})
	.on(copy.events.COPY_FILE_ERROR, (error, info) => {})
	.on(copy.events.COPY_FILE_COMPLETE, (info) => {});

// Prevent specifying both callback and promise interfaces
expectError(copy('source', 'dest', (error, results) => {}).then(() => {}));

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

expectType<WithCopyEvents<Promise<Array<CopyOperation>>>>(copy('source', 'dest'));

expectType<WithCopyEvents<{}>>(copy('source', 'dest', () => {}));

type WithCopyEvents<T> = T & {
	on(event: CopyEventType.ERROR, callback: (error: Error, info: CopyErrorInfo) => void): WithCopyEvents<T>;
	on(event: CopyEventType.COMPLETE, callback: (info: Array<CopyOperation>) => void): WithCopyEvents<T>;
	on(event: CopyEventType.CREATE_DIRECTORY_START, callback: (info: CopyOperation) => void): WithCopyEvents<T>;
	on(event: CopyEventType.CREATE_DIRECTORY_ERROR, callback: (error: Error, info: CopyOperation) => void): WithCopyEvents<T>;
	on(event: CopyEventType.CREATE_DIRECTORY_COMPLETE, callback: (info: CopyOperation) => void): WithCopyEvents<T>;
	on(event: CopyEventType.CREATE_SYMLINK_START, callback: (info: CopyOperation) => void): WithCopyEvents<T>;
	on(event: CopyEventType.CREATE_SYMLINK_ERROR, callback: (error: Error, info: CopyOperation) => void): WithCopyEvents<T>;
	on(event: CopyEventType.CREATE_SYMLINK_COMPLETE, callback: (info: CopyOperation) => void): WithCopyEvents<T>;
	on(event: CopyEventType.COPY_FILE_START, callback: (info: CopyOperation) => void): WithCopyEvents<T>;
	on(event: CopyEventType.COPY_FILE_ERROR, callback: (error: Error, info: CopyOperation) => void): WithCopyEvents<T>;
	on(event: CopyEventType.COPY_FILE_COMPLETE, callback: (info: CopyOperation) => void): WithCopyEvents<T>;
}

expectError(copy(123, 'dest'));
expectError(copy('source', 123));
expectError(copy('source', 'dest', 'options'));
