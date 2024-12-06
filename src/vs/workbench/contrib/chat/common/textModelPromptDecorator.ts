/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { TextModelPromptParser } from './textModelPromptParser.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { ModelDecorationOptions } from '../../../../editor/common/model/textModel.js';
import { ITextModel, TrackedRangeStickiness } from '../../../../editor/common/model.js';
import { chatSlashCommandBackground, chatSlashCommandForeground } from './chatColors.js';
import { registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';

/**
 * TODO: @legomushroom
 *
 * 	- find a better name for this class (don't forget to update `toString` method)
 * 	- move to the correct place
 * 	- add unit tests
 */

/**
 * TODO: @legomushroom
 */
export class TextModelPromptDecorator extends Disposable {
	/**
	 * Associated prompt parser instance.
	 */
	private readonly parser: TextModelPromptParser;

	/**
	 * List of IDs of registered text model decorations.
	 */
	private readonly decorations: string[] = [];

	/**
	 * Decoration options for prompt tokens.
	 */
	public static readonly promptDecoration = ModelDecorationOptions.register({
		description: 'Prompt decoration.', // TODO: @legomushroom - fix decription text to be based on the token type
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		className: 'prompt-decoration',
		showIfCollapsed: false,
		hoverMessage: new MarkdownString('test'), // TODO: @legomushroom - fix the hover message
	});

	constructor(
		private readonly editor: ITextModel,
		@IInstantiationService initService: IInstantiationService,
	) {
		super();

		this.parser = initService.createInstance(TextModelPromptParser, editor, []);
		this.parser.onUpdate(this.onPromptParserUpdate.bind(this));
		this.parser.start();
	}

	/**
	 * Handler for the prompt parser update event.
	 */
	private onPromptParserUpdate(): this {
		this.removeAllDecorations();
		this.addDecorations();

		return this;
	}

	/**
	 * Add a decorations for all prompt tokens.
	 */
	private addDecorations(): this {
		this.editor.changeDecorations((accessor) => {
			for (const token of this.parser.tokens) {
				const decorationId = accessor.addDecoration(
					token.range,
					TextModelPromptDecorator.promptDecoration,
				);

				this.decorations.push(decorationId);
			}
		});

		return this;
	}

	/**
	 * Remove all existing decorations.
	 */
	private removeAllDecorations(): this {
		this.editor.changeDecorations((accessor) => {
			for (const decoration of this.decorations) {
				accessor.removeDecoration(decoration);
			}
		});
		this.decorations.splice(0);

		return this;
	}

	/**
	 * Returns a string representation of this object.
	 */
	public override toString() {
		return `text-model-prompt-decorator:${this.editor.uri.path}`;
	}

	/**
	 * @inheritdoc
	 */
	public override dispose(): void {
		this.removeAllDecorations();
		super.dispose();
	}
}

/**
 * Register prompt syntax decorations related styles.
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

	const { className } = TextModelPromptDecorator.promptDecoration;
	collector.addRule(`.monaco-editor .${className} { ${styles.join(' ')} }`);
});
