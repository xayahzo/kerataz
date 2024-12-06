/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptParser } from './basePromptParser.js';
import { Emitter } from '../../../../base/common/event.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Line } from '../../../../editor/common/codecs/linesCodec/tokens/line.js';
import { newWriteableStream, ReadableStream } from '../../../../base/common/stream.js';
import { IModelContentChangedEvent } from '../../../../editor/common/textModelEvents.js';
import { ResolveError, FileOpenFailed, ParseError } from './promptFileReferenceErrors.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';

/**
 * TODO: @legomushroom
 *
 * 	- move to the correct place
 * 	- add unit tests
 */

/**
 * TODO: @legomushroom
 */
export class TextModelPromptParser extends BasePromptParser {
	constructor(
		private readonly editor: ITextModel,
		seenReferences: string[] = [],
		@IInstantiationService initService: IInstantiationService,
		@IConfigurationService configService: IConfigurationService,
	) {
		super(
			editor.uri,
			new Emitter<ReadableStream<Line> | ParseError>(),
			seenReferences,
			initService,
			configService,
		);

		// TODO: @legomushroom - we need this, don't we?
		// this._register(this.onContentChanged);

		this._register(this.editor.onDidChangeContent(this.onContentsChanged.bind(this)));
		this._register(this.editor.onWillDispose(this.dispose.bind(this)));
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

		// initiate parsing the model contents
		this.onContentsChanged(null);

		return this;
	}

	/**
	 * Handler for the model content changes event.
	 * TODO: @legomushroom - add tracking issue for the work to use changes list in the event object
	 */
	private onContentsChanged(_event: IModelContentChangedEvent | null): this {
		try {
			const stream = this.getContentsStream();
			this.onContentChanged.fire(stream);

			return this;
		} catch (error) {
			if (error instanceof ResolveError) {
				this.onContentChanged.fire(error);

				return this;
			}

			// TODO: @legomushroom - change the error type
			this.onContentChanged.fire(new FileOpenFailed(this.uri, error));
		}

		return this;
	}

	/**
	 * TODO: @legomushroom
	 */
	private cts?: CancellationTokenSource;

	/**
	 * TODO: @legomushroom
	 */
	private getContentsStream(): ReadableStream<Line> {
		if (this.cts) {
			this.cts.dispose(true);
			delete this.cts;
		}

		// TODO: @legomushroom - refactor to a decorator?
		const cts = new CancellationTokenSource();
		this.cts = cts;

		const stream = newWriteableStream<Line>(null);
		try {
			const textLines = this.editor.getLinesContent();

			for (let i = 0; i < textLines.length; i++) {
				if (cts.token.isCancellationRequested) {
					throw new CancellationError();
				}

				// line numbers are `1-based` hence the `i + 1`
				const line = new Line(i + 1, textLines[i]);
				stream.write(line);
			}

			stream.end();

			return stream;
		} catch (error) {
			stream.destroy();

			throw error;
		} finally {
			cts.dispose(true);
		}
	}

	/**
	 * Returns a string representation of this object.
	 */
	public override toString() {
		return `text-model-prompt:${this.uri.path}`;
	}
}
