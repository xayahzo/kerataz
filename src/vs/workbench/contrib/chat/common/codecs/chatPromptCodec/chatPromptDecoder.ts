/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileReference } from './tokens/fileReference.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { newWriteableStream, ReadableStream } from '../../../../../../base/common/stream.js';
import { BaseDecoder } from '../../../../../../base/common/codecs/baseDecoder.js';
import { Word } from '../../../../../../editor/common/codecs/simpleCodec/tokens/word.js';
import { SimpleDecoder, TSimpleToken } from '../../../../../../editor/common/codecs/simpleCodec/simpleDecoder.js';
import { LinesDecoder } from '../../../../../../editor/common/codecs/linesCodec/linesDecoder.js';
import { Line } from '../../../../../../editor/common/codecs/linesCodec/tokens/line.js';
import { NewLine } from '../../../../../../editor/common/codecs/linesCodec/tokens/newLine.js';

/**
 * Tokens handled by the `ChatPromptDecoder` decoder.
 */
export type TChatPromptToken = FileReference;

/**
 * Decoder for the common chatbot prompt message syntax.
 * For instance, the file references `#file:./path/file.md` are handled by this decoder.
 */
export class ChatPromptDecoder extends BaseDecoder<TChatPromptToken, TSimpleToken> {
	constructor(stream: ReadableStream<VSBuffer>);
	constructor(stream: SimpleDecoder);
	constructor(stream: LinesDecoder);
	constructor(stream: ReadableStream<any>) {
		if (stream instanceof SimpleDecoder) {
			super(stream);

			return;
		}

		if (stream instanceof LinesDecoder) {
			super(new SimpleDecoder(stream));

			return;
		}

		super(new SimpleDecoder(stream));
	}

	/**
	 * TODO: @legomushroom
	 */
	public static fromLines(stream: ReadableStream<Line>): ChatPromptDecoder {
		const binaryStream = newWriteableStream<VSBuffer>(null);

		let previousLineExists = false;
		stream.on('data', (data) => {
			binaryStream.write(VSBuffer.fromString(data.text));
			if (previousLineExists) {
				// TODO: @legomushroom - use platform-specific EOL?
				binaryStream.write(NewLine.byte);
			}

			previousLineExists = true;
		});

		stream.on('end', binaryStream.end.bind(binaryStream));
		stream.on('error', binaryStream.error.bind(binaryStream));

		return new ChatPromptDecoder(binaryStream);
	}

	protected override onStreamData(simpleToken: TSimpleToken): void {
		// handle the word tokens only
		if (!(simpleToken instanceof Word)) {
			return;
		}

		// handle file references only for now
		const { text } = simpleToken;
		if (!text.startsWith(FileReference.TOKEN_START)) {
			return;
		}

		this._onData.fire(
			FileReference.fromWord(simpleToken),
		);
	}
}
