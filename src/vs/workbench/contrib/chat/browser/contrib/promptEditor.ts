/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { assert } from '../../../../../base/common/assert.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { newWriteableStream } from '../../../../../base/common/stream.js';
import { PromptFileReference } from '../../common/promptFileReference.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ModelDecorationOptions } from '../../../../../editor/common/model/textModel.js';
import { ITextModel, TrackedRangeStickiness } from '../../../../../editor/common/model.js';
import { ChatbotPromptCodec } from '../../common/codecs/chatPromptCodec/chatPromptCodec.js';
import { registerThemingParticipant } from '../../../../../platform/theme/common/themeService.js';
import { chatSlashCommandBackground, chatSlashCommandForeground } from '../../common/chatColors.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatbotPromptDecoder, TChatbotPromptToken } from '../../common/codecs/chatPromptCodec/chatPromptDecoder.js';

/**
 * TODO: @legomushroom
 */
export class PromptEditor extends Disposable {
	/**
	 * TODO: @legomushroom
	*/
	private readonly codec: ChatbotPromptCodec = this._register(new ChatbotPromptCodec());

	/**
	 * TODO: @legomushroom
	*/
	private currentDecoder?: ChatbotPromptDecoder;

	/**
	 * TODO: @legomushroom
	*/
	private readonly tokens: TChatbotPromptToken[] = [];

	/**
	 * TODO: @legomushroom
	*/
	private readonly decorations: string[] = [];

	/**
	 * TODO: @legomushroom
	*/
	private readonly _onDispose = this._register(new Emitter<void>());

	/**
	 * TODO: @legomushroom
	*/
	private _disposed: boolean = false;
	public get disposed(): boolean {
		return this._disposed;
	}

	constructor(
		private readonly editor: ITextModel,
	) {
		super();

		this.dispose = this.dispose.bind(this);
		this.updateTokens = this.updateTokens.bind(this);

		// TODO: @legomushroom - be smarter, use the changes event here
		this._register(editor.onDidChangeContent((event) => {
			this.updateTokens();

			return event;
		}));

		this._register(editor.onWillDispose(this.dispose));

		this.updateTokens();
	}

	/**
	 * TODO: @legomushroom
	 */
	private async updateTokens(): Promise<this> {
		this.cleanup();
		this.updateDecorations();

		const text = this.editor.getValue();
		if (!text.trim()) {
			return this;
		}

		const stream = newWriteableStream<VSBuffer>(null);
		// TODO: @legomushroom - explicitely dispose the decoder instead
		this.currentDecoder = this.codec.decode(stream);

		this.currentDecoder.onData((token) => {
			this.tokens.push(token);
			this.updateDecorations();
		});

		this.currentDecoder.start();

		// TODO: @legomushroom - add an utility for this
		stream.write(VSBuffer.fromString(text));
		// stream.end();

		return this;
	}

	public static readonly decorationOptions = ModelDecorationOptions.register({
		description: 'Prompt file reference.',
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		className: 'prompt-file-reference',
		showIfCollapsed: false,
		hoverMessage: new MarkdownString('test'),
	});

	/**
	 * TODO: @legomushroom
	 */
	private updateDecorations(): this {
		this.editor.changeDecorations((accessor) => {
			for (const token of this.tokens) {
				this.decorations.push(
					accessor.addDecoration(token.range, PromptEditor.decorationOptions),
				);
			}
		});

		return this;
	}

	/**
	 * TODO: @legomushroom
	 */
	private cleanup(): this {
		this.currentDecoder?.dispose();
		delete this.currentDecoder;

		// TODO: @legomushroom - dispose the tokens?
		this.tokens.splice(0);

		// remove all decorations
		this.editor.changeDecorations((accessor) => {
			for (const decoration of this.decorations) {
				accessor.removeDecoration(decoration);
			}
		});
		this.decorations.splice(0);

		return this;
	}

	/**
	 * Register a callback that will be called
	 * when this object is disposed.
	 */
	public onDispose(callback: () => void): this {
		assert(
			!this._disposed,
			'Cannot register `onDispose()` callback on an already disposed prompt editor.',
		);

		this._register(this._onDispose.event(callback));
		return this;
	}

	public override dispose() {
		if (this._disposed) {
			return;
		}

		this._disposed = true;
		this.cleanup();
		this._onDispose.fire();
		super.dispose();
	}
}

/**
 * TODO: @legomushroom
 */
export class PromptEditorContribution extends Disposable {
	/**
	 * TODO: @legomushroom
	*/
	private readonly editors: Map<ITextModel, PromptEditor> = new Map();

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService configService: IConfigurationService,
	) {
		super();

		// TODO: @legomushroom - uncomment
		// if (!PromptFileReference.promptSnippetsEnabled(configService)) {
		// 	return;
		// }

		this.deleteEditor = this.deleteEditor.bind(this);

		this._register(this.editorService.onDidActiveEditorChange(() => {
			const editorModel = this.editorService.activeTextEditorControl?.getModel();
			if (!editorModel) {
				return;
			}

			// we support only `text editors` for now so filter out `diff` ones
			if ('modified' in editorModel || 'model' in editorModel) {
				return;
			}

			// enable this on editors for prompt snippet files
			if (!PromptFileReference.isPromptSnippetFile(editorModel.uri)) {
				return;
			}

			let promptEditor = this.editors.get(editorModel);
			// if a valid prompt editor exists, nothing to do
			if (promptEditor && !promptEditor.disposed) {
				return;
			}

			// Note! TODO: @legomushroom
			if (promptEditor?.disposed) {
				this.deleteEditor(editorModel);
			}

			// add new prompt editor instance for this model
			promptEditor = this.instantiationService.createInstance(PromptEditor, editorModel);
			this.editors.set(editorModel, promptEditor);

			// automatically delete a disposed prompt editor
			promptEditor.onDispose(this.deleteEditor.bind(this, editorModel));
		}));
	}

	/**
	 * Delete and dispose specified editor model from the cache.
	 */
	private deleteEditor(editorModel: ITextModel): this {
		// TODO: @legomushroom - throw if not exists?
		const promptEditor = this.editors.get(editorModel);
		if (!promptEditor) {
			return this;
		}

		promptEditor.dispose();
		this.editors.delete(editorModel);

		return this;
	}

	public override dispose() {
		// dispose all editors
		[...this.editors.keys()]
			.map(this.deleteEditor);

		super.dispose();
	}
}

/**
 * TODO: @legomushroom
 */
registerThemingParticipant((theme, collector) => {
	const styles = [
		'border-radius: 3px;',
	];

	const backgroundColor = theme.getColor(chatSlashCommandBackground);
	if (backgroundColor) {
		styles.push(`background-color: ${backgroundColor};`);
	}

	const color = theme.getColor(chatSlashCommandForeground);
	if (color) {
		styles.push(`color: ${backgroundColor};`);
	}

	const { className } = PromptEditor.decorationOptions;

	collector.addRule(`.monaco-editor .${className} { ${styles.join(' ')} }`);
});
