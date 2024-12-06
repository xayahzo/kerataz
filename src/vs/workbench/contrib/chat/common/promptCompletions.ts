/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// TODO: @legomushroom
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Position } from '../../../../editor/common/core/position.js';
import { CompletionContext, CompletionItemKind, CompletionList } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { localize } from '../../../../nls.js';
import { PROMP_SNIPPET_FILE_EXTENSION } from './basePromptParser.js';
import { FileReference } from './codecs/chatPromptCodec/tokens/fileReference.js';
import { Range } from '../../../../editor/common/core/range.js';

/**
 * TODO: @legomushroom
 */
export class PromptFileCompletions extends Disposable {
	constructor(
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
	) {
		super();

		const languageSelector = {
			pattern: `**/*${PROMP_SNIPPET_FILE_EXTENSION}`,
			hasAccessToAllModels: true,
		};

		this._register(this.languageFeaturesService.completionProvider.register(languageSelector, {
			_debugDisplayName: 'PromptCompletions',
			triggerCharacters: ['#'],
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, token: CancellationToken) => {
				const result: CompletionList = { suggestions: [] };

				const range = new Range(
					position.lineNumber,
					position.column,
					position.lineNumber,
					position.column + 1,
				);

				if (range) {
					if (position.column === 2) {
						result.suggestions.push({
							label: 'header',
							insertText: '',
							detail: localize('addMarkdownHeaderLabel', "Add a header (default)"),
							range,
							kind: CompletionItemKind.Field,
							sortText: '1',
						});
					}

					result.suggestions.push({
						label: '[copilot] #file:reference',
						insertText: FileReference.TOKEN_START.slice(1),
						detail: localize('pickFileLabel', "Pick a file"),
						range,
						kind: CompletionItemKind.File,
						sortText: '2',
					});
				}

				return result;
			}
		}));
	}

	// /**
	//  * TODO: @legomushroom
	//  */
	// private getCompletionRange(model: ITextModel, position: Position): IRange | undefined {

	// }
}
