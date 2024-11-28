/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { newWriteableStream } from '../../../../../base/common/stream.js';
import { dynamicVariableDecorationType } from './chatDynamicVariables.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { IDecorationOptions } from '../../../../../editor/common/editorCommon.js';
import { ChatbotPromptCodec } from '../../common/codecs/chatPromptCodec/chatPromptCodec.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ChatbotPromptDecoder, TChatbotPromptToken } from '../../common/codecs/chatPromptCodec/chatPromptDecoder.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { chatSlashCommandBackground, chatSlashCommandForeground } from '../../common/chatColors.js';

/**
 * TODO: @legomushroom
 */
const decorationDescription = 'chat';

/**
 * TODO: @legomushroom
 */
const toDecoration = (token: TChatbotPromptToken): IDecorationOptions => {
	return {
		range: token.range,
		hoverMessage: [], // TODO: @legomushroom - add hover message
	};
};

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

	constructor(
		private readonly editor: ICodeEditor,
	) {
		super();

		this._register(editor.onDidChangeModelContent(() => {
			// TODO: @legomushroom - be smarter, use the changes event here
			this.parseTokens();
		}));

		this._register(editor.onDidChangeModel(() => {
			// TODO: @legomushroom - be smarter, use the changes event here
			this.parseTokens();
		}));

		this._register(editor.onDidDispose(() => {
			this.dispose();
		}));

		this.parseTokens();
	}

	/**
	 * TODO: @legomushroom
	 */
	private async parseTokens(): Promise<this> {
		this.disposeCurrentDecoder();
		this.updateDecorations();

		const text = this.editor.getValue();
		if (!text.trim()) {
			return this;
		}

		const stream = newWriteableStream<VSBuffer>(null);
		// TODO: @legomushroom - explicitely dispose the decoder instead
		this.currentDecoder = this.codec.decode(stream);

		this.currentDecoder.onData((token) => {
			// TODO: @legomushroom - remove this
			if (!token.path.endsWith('.prompt.md\r')) {
				return;
			}

			this.tokens.push(token);
			this.updateDecorations();
		});

		this.currentDecoder.start();

		// TODO: @legomushroom - add an utility for this
		stream.write(VSBuffer.fromString(text));
		stream.end();

		return this;
	}

	/**
	 * TODO: @legomushroom
	 */
	private updateDecorations(): this {
		const decorations = this.tokens.map(toDecoration);

		this.editor.setDecorationsByType(
			decorationDescription,
			dynamicVariableDecorationType,
			decorations,
		);

		return this;
	}

	/**
	 * TODO: @legomushroom
	 */
	private disposeCurrentDecoder(): this {
		this.currentDecoder?.dispose();
		delete this.currentDecoder;

		// TODO: @legomushroom - dispose tokens instead?
		this.tokens.splice(0);

		return this;
	}

	public override dispose() {
		this.disposeCurrentDecoder();
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
	private readonly editors: Map<ICodeEditor, PromptEditor> = new Map();

	constructor(
		@ICodeEditorService private readonly editorService: ICodeEditorService,
		@IThemeService private readonly themeService: IThemeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		const theme = this.themeService.getColorTheme();
		this.editorService.registerDecorationType(decorationDescription, dynamicVariableDecorationType, {
			color: theme.getColor(chatSlashCommandForeground)?.toString(),
			backgroundColor: theme.getColor(chatSlashCommandBackground)?.toString(),
			borderRadius: '3px'
		});

		this._register(this.editorService.onCodeEditorAdd((editor) => {
			if (this.editors.has(editor)) {
				return;
			}

			// const model = editor.getModel();
			// if (!model) {
			// 	return;
			// }

			// // TODO: @legomushroom - remove restiction
			// // TODO: @legomushroom - use constant instead
			// if (!model.uri.path.endsWith('.prompt.md')) {
			// 	return;
			// }

			const promptEditor = this.instantiationService.createInstance(PromptEditor, editor);
			this.editors.set(editor, promptEditor);

			const onDidDispose = editor.onDidDispose(() => {
				this.deleteEditor(editor);
				onDidDispose.dispose();
			});
		}));
	}

	/**
	 * TODO: @legomushroom
	 */
	private deleteEditor(editor: ICodeEditor): this {
		// TODO: @legomushroom - throw if not exists?
		const promptEditor = this.editors.get(editor);
		if (!promptEditor) {
			return this;
		}

		// TODO: @legomushroom - we don't have to dispose here since the `PromptEditor` does that automatically
		promptEditor.dispose();
		this.editors.delete(editor);

		return this;
	}

	public override dispose() {
		// dispose all editors
		[...this.editors.keys()]
			.map(this.deleteEditor.bind(this));

		// TODO: @legomushroom - dispose all this.editors
		super.dispose();
	}
}

// Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(PromptSyntaxProvider, LifecyclePhase.Eventually);
