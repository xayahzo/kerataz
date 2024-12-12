/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPromptProvider } from './basePromptTypes.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { PromptContentsProviderBase } from './promptContentsProviderBase.js';
import { Line } from '../../../../editor/common/codecs/linesCodec/tokens/line.js';
import { newWriteableStream, ReadableStream } from '../../../../base/common/stream.js';
import { IModelContentChangedEvent } from '../../../../editor/common/textModelEvents.js';

/**
 * TODO: @legomushroom
 * TODO: @legomushroom - move to a correct place
 */
export class TextModelContentsProvider extends PromptContentsProviderBase<IModelContentChangedEvent> implements IPromptProvider {
	public readonly uri = this.model.uri;

	constructor(
		private readonly model: ITextModel,
	) {
		super();

		this._register(this.model.onWillDispose(this.dispose.bind(this)));
		this._register(this.model.onDidChangeContent(this.onChangeEmitter.fire));
	}

	protected override async getContentsStream(
		_event: IModelContentChangedEvent | 'full',
	): Promise<ReadableStream<Line>> {
		// TODO: @legomushroom - use the `event` for incremental updates

		const stream = newWriteableStream<Line>(null);

		setTimeout(() => {
			if (this.model.isDisposed()) {
				stream.error(new Error('Model is disposed'));
				return;
			}

			const textLines = this.model.getLinesContent();

			// TODO: @legomushroom - throw if this object was disposed or cts was cancelled
			for (let i = 0; i < textLines.length; i++) {
				// line numbers are `1-based` hence the `i + 1`
				stream.write(
					new Line(i + 1, textLines[i]),
				);
			}

			stream.end();
		}, 1);

		return stream;
	}

	public override toString() {
		return `text-model-contents-provider:${this.uri.path}`;
	}
}
