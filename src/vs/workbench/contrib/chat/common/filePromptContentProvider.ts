/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IPromptProvider } from './basePromptTypes.js';
import { BasePromptParser } from './basePromptParser.js';
// import { cancelOnDispose } from './cancelOnDisposeDecorator.js';
import { basename } from '../../../../base/common/resources.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { BaseDecoder } from '../../../../base/common/codecs/baseDecoder.js';
import { PromptContentsProviderBase } from './promptContentsProviderBase.js';
import { Line } from '../../../../editor/common/codecs/linesCodec/tokens/line.js';
import { FileOpenFailed, NotPromptSnippetFile } from './promptFileReferenceErrors.js';
import { LinesDecoder } from '../../../../editor/common/codecs/linesCodec/linesDecoder.js';
import { FileChangesEvent, FileChangeType, IFileService } from '../../../../platform/files/common/files.js';

/**
 * TODO: @legomushroom
 * TODO: @legomushroom - move to the correct place
 */
export class FilePromptContentProvider extends PromptContentsProviderBase<FileChangesEvent> implements IPromptProvider {
	/**
	 * TODO: @legomushroom
	 */
	private _disposed: boolean = false;
	public get disposed(): boolean {
		return this._disposed;
	}

	/**
	 * TODO: @legomushroom
	 */
	public override dispose(): void {
		if (this._disposed) {
			return;
		}

		this._disposed = true;
		super.dispose();
	}

	constructor(
		public readonly uri: URI,
		@IFileService private readonly fileService: IFileService,
	) {
		super();

		// make sure the object is updated on file changes
		this._register(
			this.fileService.onDidFilesChange((event) => {
				// we support only full file parsing right now
				if (event.contains(this.uri, FileChangeType.UPDATED)) {
					return this.onChangeEmitter.fire('full');
				}

				// if file was deleted, forward the event to the
				// `getContentsStream` method to handle the error
				if (event.contains(this.uri, FileChangeType.DELETED)) {
					return this.onChangeEmitter.fire(event);
				}
			}),
		);
	}

	/**
	 * TODO: @legomushroom
	 */
	// @cancelOnDispose
	protected async getContentsStream(
		event: FileChangesEvent | 'full',
		cancellationToken?: CancellationToken,
	): Promise<BaseDecoder<Line>> {
		if (cancellationToken?.isCancellationRequested) {
			throw new CancellationError();
		}

		// the file was deleted so error out
		if (event !== 'full' && event.contains(this.uri, FileChangeType.DELETED)) {
			throw new FileOpenFailed(this.uri, 'Failed to open non-existing file.');
		}

		// if URI doesn't point to a prompt snippet file, don't try to resolve it
		if (!BasePromptParser.isPromptSnippet(this.uri)) {
			throw new NotPromptSnippetFile(this.uri);
		}

		const fileStream = await this.fileService.readFileStream(this.uri);

		if (!fileStream) {
			throw new FileOpenFailed(this.uri, 'Failed to open file stream.');
		}

		if (cancellationToken?.isCancellationRequested) {
			fileStream.value.destroy();
			throw new CancellationError();
		}

		// filter out all non-line tokens
		const linesDecoder = new LinesDecoder(fileStream.value);
		(linesDecoder as any).toString = () => {
			return `[${basename(this.uri)}]`;
		};

		const stream = linesDecoder
			.transform((token) => {
				if (token instanceof Line) {
					return token;
				}

				return null;
			});

		(stream as any).toString = () => {
			return `[${basename(this.uri)}]`;
		};

		// // TODO: @legomushroom - remove?
		// this._register(stream);

		return stream;
	}

	/**
	 * Returns a string representation of this object.
	 */
	public override toString() {
		return `file-prompt-contents-provider:${this.uri.path}`;
	}
}
