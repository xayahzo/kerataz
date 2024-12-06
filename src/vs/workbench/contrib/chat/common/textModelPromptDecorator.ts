/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromptPart } from './promptLine.js';
import { basename } from '../../../../base/common/path.js';
import { Emitter } from '../../../../base/common/event.js';
import { PromptFileReference } from './promptFileReference.js';
import { assertNever } from '../../../../base/common/assert.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { TextModelPromptParser } from './textModelPromptParser.js';
import { ModelDecorationOptions } from '../../../../editor/common/model/textModel.js';
import { ITextModel, TrackedRangeStickiness } from '../../../../editor/common/model.js';
import { IMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
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
 * Disposable object that tracks its disposed state and provides
 * the `onDispose` event to subscribe for. The disposable state
 * of the object can be checked with a public `disposed` property.
 *
 * TODO: @legomushroom - what to do with this object?
 */
class TrackedDisposable extends Disposable {
	/**
	 * Private emitter for the `onDispose` event.
	 */
	private readonly _onDispose = this._register(new Emitter<void>());

	/**
	 * The event is fired when this object is disposed.
	 * @param callback The callback function to be called on updates.
	 */
	public readonly onDispose = this._onDispose.event;

	/**
	 * Private field to store the disposed state of this object.
	 */
	private _disposed: boolean = false;

	/**
	 * Check if this object is disposed.
	 */
	public get disposed(): boolean {
		return this._disposed;
	}

	/**
	 * @inheritdoc
	 */
	public override dispose(): void {
		if (this._disposed) {
			return;
		}

		this._disposed = true;
		this._onDispose.fire();

		super.dispose();
	}
}

/**
 * Decoration object.
 *
 * TODO: @legomushroom - move to the correct place?
 */
interface IModelDecoration {
	/**
	 * Range of the decoration.
	 */
	range: IRange;

	/**
	 * Associated decoration options.
	 */
	options: ModelDecorationOptions;
}

/**
 * Enumeration of prompt syntax decoration CSS class names.
 *
 * TODO: @legomushroom - move to the correct place?
 */
enum DecorationClassNames {
	/**
	 * CSS class name for `default` prompt syntax decoration.
	 */
	default = 'prompt-decoration',

	/**
	 * CSS class name for `file reference` prompt syntax decoration.
	 */
	fileReference = DecorationClassNames.default,
}

/**
 * Prompt syntax decorations provider for text models.
 */
export class TextModelPromptDecorator extends TrackedDisposable {
	/**
	 * Associated prompt parser instance.
	 */
	private readonly parser: TextModelPromptParser;

	/**
	 * List of IDs of registered text model decorations.
	 */
	private readonly registeredDecorationIDs: string[] = [];

	constructor(
		private readonly editor: ITextModel,
		@IInstantiationService initService: IInstantiationService,
	) {
		super();

		this.editor.onWillDispose(this.dispose.bind(this));

		this.parser = initService.createInstance(TextModelPromptParser, editor, []);
		this.parser.onUpdate(this.onPromptParserUpdate.bind(this));
		this.parser.start();
	}

	/**
	 * Handler for the prompt parser update event.
	 */
	private onPromptParserUpdate(): this {
		// TODO: @legomushroom - add a tracking issue for the work to update existing decorations instead of always re - creating them
		this.removeAllDecorations();
		this.addDecorations();

		return this;
	}

	/**
	 * Add a decorations for all prompt tokens.
	 */
	private addDecorations(): this {
		this.editor.changeDecorations((accessor) => {
			for (const decoration of this.decorations) {
				const decorationID = accessor.addDecoration(
					decoration.range,
					decoration.options,
				);

				this.registeredDecorationIDs.push(decorationID);
			}
		});

		return this;
	}

	/**
	 * Get decorations for all currently available prompt tokens.
	 */
	private get decorations(): readonly IModelDecoration[] {
		const result: IModelDecoration[] = [];
		const { tokens } = this.parser; // TODO: @legomushroom - get the tokens for the current document only

		for (const token of tokens) {
			result.push({
				range: token.range,
				options: this.getDecorationFor(token),
			});
		}

		return result;
	}

	/**
	 * Get decoration options for a provided prompt token.
	 */
	private getDecorationFor(token: TPromptPart): ModelDecorationOptions {
		const className = DecorationClassNames.default; // TODO: @legomushroom - update this

		return ModelDecorationOptions.createDynamic({
			description: 'Prompt syntax decoration.', // TODO: @legomushroom - fix decription text to be based on the token type
			className,
			hoverMessage: this.getHoveMessageFor(token),
			stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		});
	}

	/**
	 * Get decoration hover message for a provided prompt token.
	 */
	private getHoveMessageFor(token: TPromptPart): IMarkdownString[] {
		if (token instanceof PromptFileReference) {
			const result = [
				new MarkdownString(basename(token.uri.path)),
			];

			// TODO: @legomushroom - also handle error conditions on the file reference

			for (const uri of token.allValidFileReferenceUris) {
				result.push(new MarkdownString(
					`  - ${basename(uri.path)}`,
				));
			}

			return result;
		}

		assertNever(
			token,
			`Faild to create prompt token hover message, unexpected token type: '${token}'.`,
		);
	}

	/**
	 * Remove all existing decorations.
	 */
	private removeAllDecorations(): this {
		this.editor.changeDecorations((accessor) => {
			for (const decoration of this.registeredDecorationIDs) {
				accessor.removeDecoration(decoration);
			}
		});
		this.registeredDecorationIDs.splice(0);

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

	collector.addRule(`.monaco-editor .${DecorationClassNames.default} { ${styles.join(' ')} }`);
});
