/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { BasePromptParser } from './basePromptParser.js';
import { Emitter } from '../../../../base/common/event.js';
import { extUri } from '../../../../base/common/resources.js';
import { cancelOnDispose } from './cancelOnDisposeDecorator.js';
import { ReadableStream } from '../../../../base/common/stream.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { BaseDecoder } from '../../../../base/common/codecs/baseDecoder.js';
import { FileReference } from './codecs/chatPromptCodec/tokens/fileReference.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Line } from '../../../../editor/common/codecs/linesCodec/tokens/line.js';
import { LinesDecoder } from '../../../../editor/common/codecs/linesCodec/linesDecoder.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { FileChangesEvent, FileChangeType, IFileService } from '../../../../platform/files/common/files.js';
import { ResolveError, FileOpenFailed, NotPromptSnippetFile, ParseError } from './promptFileReferenceErrors.js';


/**
 * TODO: @legomushroom - list
 *
 *  - add the test contribution for the `TextModelPromptParser`
 *  - add comments
 *  - add unit tests
 */

/**
 * TODO: @legomushroom - move to the correct place
 */

/**
 * File extension for the prompt snippet files.
 */
const PROMP_SNIPPET_FILE_EXTENSION: string = '.prompt.md';

/**
 * TODO: @legomushroom
 */
export class FilePromptParser extends BasePromptParser {
	constructor(
		uri: URI,
		seenReferences: string[] = [],
		@IFileService private readonly fileService: IFileService,
		@IInstantiationService initService: IInstantiationService,
		@IConfigurationService configService: IConfigurationService,
	) {
		super(
			uri,
			new Emitter<ReadableStream<Line> | ParseError>(),
			seenReferences,
			initService,
			configService,
		);

		// TODO: @legomushroom - we need this, don't we?
		// this._register(this.onContentChanged);

		// make sure the variable is updated on file changes
		// but only for the prompt snippet files
		if (this.isPromptSnippetFile) {
			this._register(
				this.fileService.onDidFilesChange(this.onFilesChanged.bind(this)),
			);

			return;
		}

		this.onContentChanged.fire(new NotPromptSnippetFile(this.uri));
	}

	/**
	 * TODO: @legomushroom
	 */
	public override start(): this {
		// if resolve already failed, don't try to resolve again
		if (this.resolveFailed) {
			return this;
		}

		// TODO: @legomushroom - throw if disposed?

		// initiate parsing file contents
		this.onFilesChanged(new FileChangesEvent([
			{
				type: FileChangeType.UPDATED,
				resource: this.uri,
			},
		], false)); // TODO: @legomushroom - is the `false` here correct?

		return this;
	}

	/**
	 * TODO: @legomushroom
	 */
	private cts?: CancellationTokenSource;

	/**
	 * TODO: @legomushroom
	 */
	@cancelOnDispose
	private async getContentsStream(): Promise<BaseDecoder<Line>> {
		// if URI doesn't point to a prompt snippet file, don't try to resolve it
		if (this.uri.path.endsWith(PROMP_SNIPPET_FILE_EXTENSION) === false) {
			throw new NotPromptSnippetFile(this.uri);
		}

		if (this.cts) {
			this.cts.dispose(true);
			delete this.cts;
		}

		// TODO: @legomushroom - refactor to a decorator?
		const cts = new CancellationTokenSource();
		this.cts = cts;

		try {
			const fileStream = await this.fileService.readFileStream(this.uri, {}, cts.token);

			if (!fileStream) {
				throw new FileOpenFailed(this.uri, 'Failed to open file stream.');
			}

			// TODO: @legomushroom - remove?
			if (cts.token.isCancellationRequested) {
				fileStream.value.destroy();
				throw new CancellationError();
			}

			// filter out all non-line tokens
			const stream = (new LinesDecoder(fileStream.value))
				.transform((token) => {
					if (token instanceof Line) {
						return token;
					}

					return null;
				});

			return stream;
		} catch (error) {
			throw new FileOpenFailed(this.uri, error);
		} finally {
			cts.dispose(true);
		}
	}

	/**
	 * Event handler for the `onDidFilesChange` event.
	 */
	private onFilesChanged(event: FileChangesEvent): this {
		const fileChanged = event.contains(this.uri, FileChangeType.UPDATED);
		const fileDeleted = event.contains(this.uri, FileChangeType.DELETED);
		if (!fileChanged && !fileDeleted) {
			return this;
		}

		// TODO: @legomushroom - if `fileDeleted` then dispose the current instance and set the correct error condition

		this.getContentsStream()
			.then((stream) => {
				this.onContentChanged.fire(stream);
			})
			.catch((error) => {
				if (error instanceof ResolveError) {
					this.onContentChanged.fire(error);

					return;
				}

				this.onContentChanged.fire(new FileOpenFailed(this.uri, error));
			});

		return this;
	}

	/**
	 * Check if the current reference points to a prompt snippet file.
	 */
	public get isPromptSnippetFile(): boolean {
		return this.uri.path.endsWith(PROMP_SNIPPET_FILE_EXTENSION);
	}

	/**
	 * Returns a string representation of this object.
	 */
	public override toString() {
		return `file-prompt:${this.uri.path}`;
	}
}


/**
 * TODO: @legomushroom
 */
export class PromptFileReference extends FilePromptParser {
	constructor(
		public readonly token: FileReference,
		dirname: URI,
		seenReferences: string[] = [],
		@IFileService fileService: IFileService,
		@IInstantiationService initService: IInstantiationService,
		@IConfigurationService configService: IConfigurationService,
	) {
		const fileUri = extUri.resolvePath(dirname, token.path);
		super(fileUri, seenReferences, fileService, initService, configService);
	}
}
