/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { Emitter } from '../../../../base/common/event.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { PromptFileReference } from './promptFileReference.js';
import { assertNever } from '../../../../base/common/assert.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { newWriteableStream } from '../../../../base/common/stream.js';
import { ChatPromptCodec } from './codecs/chatPromptCodec/chatPromptCodec.js';
import { FileReference } from './codecs/chatPromptCodec/tokens/fileReference.js';
import { ChatPromptDecoder } from './codecs/chatPromptCodec/chatPromptDecoder.js';
import { Line } from '../../../../editor/common/codecs/linesCodec/tokens/line.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';

/**
 * TODO: @legomushroom - move to the correct place
 */

/**
 * TODO: @legomushroom
 */
export type TPromptPart = PromptFileReference;

/**
 * TODO: @legomushroom
 */
export class PromptLine extends Disposable {
	/**
	 * TODO: @legomushroom
	 */
	public readonly tokens: TPromptPart[] = [];

	private readonly _onUpdate = this._register(new Emitter<void>());

	public onUpdate(callback: () => void): void {
		this._register(this._onUpdate.event(callback));
	}

	/**
	 * TODO: @legomushroom
	 */
	private decoder: ChatPromptDecoder;

	constructor(
		public readonly lineToken: Line,
		public readonly dirname: URI,
		protected readonly seenReferences: string[] = [],
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IConfigurationService protected readonly configService: IConfigurationService,
	) {
		super();

		this._onUpdate.fire = this._onUpdate.fire.bind(this._onUpdate);

		const stream = newWriteableStream<VSBuffer>(null);
		this.decoder = ChatPromptCodec.decode(stream);

		const { startLineNumber } = lineToken.range;
		this.decoder.onData((token) => {
			// TODO: @legomushroom
			if (this.decoder.isEnded) {
				console.log('oops!');
			}

			// TODO: @legomushroom
			if (this.decoder.disposed) {
				console.log('oops!');
			}

			token.updateRange({
				startLineNumber: startLineNumber,
				endLineNumber: startLineNumber, // TODO: @legomushroom - do we care about the end line numbers?
			});

			if (token instanceof FileReference) {
				const fileReference = this.instantiationService.createInstance(
					PromptFileReference,
					token,
					this.dirname,
					seenReferences,
				);

				fileReference.onUpdate(this._onUpdate.fire);
				this.tokens.push(fileReference);

				fileReference.start();

				this._onUpdate.fire();

				return;
			}

			// TODO: @legomushroom - better way to error out on unsupported token
			assertNever(
				token,
				`Unsupported token '${token}'.`,
			);
		});

		this.decoder.onError((error) => {
			// TODO: @legomushroom - handle the error
			console.log(`[line decoder] error: ${error}`);

			this._onUpdate.fire();
		});

		stream.write(VSBuffer.fromString(this.lineToken.text));
		stream.end();
	}

	/**
	 * TODO: @legomushroom
	 */
	public getTokens(): readonly TPromptPart[] {
		const result = [];

		for (const token of this.tokens) {
			result.push(token);

			if (token instanceof PromptFileReference) {
				result.push(...token.getTokens());
			}
		}

		return result;
	}

	/**
	 * TODO: @legomushroom
	 */
	public start(): this {
		// TODO: @legomushroom - handle the `onError` and `onEnd` events

		// TODO: @legomushroom - do we need this?
		this.decoder.start();

		return this;
	}

	public override dispose(): void {
		this.decoder.dispose();

		for (const token of this.tokens) {
			// if token has a `dispose` function, call it
			if ('dispose' in token && typeof token.dispose === 'function') {
				token.dispose();
			}
		}

		super.dispose();
	}
}
