/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { assert } from '../../../../base/common/assert.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { extUri } from '../../../../base/common/resources.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { Range } from '../../../../editor/common/core/range.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { PROMP_SNIPPET_FILE_EXTENSION } from './basePromptParser.js';
import { Position } from '../../../../editor/common/core/position.js';
import { newWriteableStream } from '../../../../base/common/stream.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { FileReference } from './codecs/chatPromptCodec/tokens/fileReference.js';
import { ChatPromptDecoder } from './codecs/chatPromptCodec/chatPromptDecoder.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { CompletionContext, CompletionItemKind, CompletionList } from '../../../../editor/common/languages.js';

/**
 * Prompt snippets language selector.
 */
const languageSelector = {
	pattern: `**/*${PROMP_SNIPPET_FILE_EXTENSION}`,
	hasAccessToAllModels: true,
};

/**
 * TODO: @legomushroom
 */
export class PromptCommandCompletions extends Disposable {
	constructor(
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
	) {
		super();

		this._register(this.languageFeaturesService.completionProvider.register(languageSelector, {
			_debugDisplayName: 'PromptCompletions',
			triggerCharacters: ['#'],
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, token: CancellationToken) => {
				const result: CompletionList = { suggestions: [] };

				const range = new Range(
					position.lineNumber,
					position.column,
					position.lineNumber,
					position.column + 1, // TODO: @legomushroom - can it be empty instead?
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

/**
 * TODO: @legomushroom
 */
export class PromptFilePathCompletions extends Disposable {
	constructor(
		@IFileService private readonly fileService: IFileService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
	) {
		super();

		this._register(this.languageFeaturesService.completionProvider.register(languageSelector, {
			_debugDisplayName: 'PromptCompletions',
			triggerCharacters: ['.', '/'],
			provideCompletionItems: async (model: ITextModel, position: Position, _context: CompletionContext, token: CancellationToken) => {
				const result: CompletionList = { suggestions: [] };

				const lineText = model.getLineContent(position.lineNumber);
				const stream = newWriteableStream<VSBuffer>(null); // TODO: @legomushroom - add `ChatPromptDecoder.fromString()` constructor?
				const decoder = new ChatPromptDecoder(stream);

				stream.write(VSBuffer.fromString(lineText));
				stream.end();

				const tokens: FileReference[] = [];
				for await (const token of decoder) {
					if (token === null || !(token instanceof FileReference)) {
						break;
					}

					token.updateRange({
						startLineNumber: position.lineNumber,
						endLineNumber: position.lineNumber,
					});

					tokens.push(token);
				}

				const linkTokens = tokens.filter((token) => {
					return token.range.containsPosition(position);
				});

				// no file link found at this position
				if (linkTokens.length === 0) {
					return result;
				}

				// only one file reference token can intersect with
				// the position, otherwise we have a logic error
				assert(
					linkTokens.length === 1,
					`Expected a single file link token, but got '${linkTokens.length}'.`
				);

				const linkToken = linkTokens[0];

				const dirname = extUri.dirname(model.uri);
				const fsNodePath = extUri.resolvePath(dirname, linkToken.path);

				const fsNode = await this.fileService.resolve(fsNodePath);

				if (fsNode.isFile) {
					return result;
				}

				if (!fsNode.children) {
					return result;
				}

				const range = new Range(
					position.lineNumber,
					position.column,
					position.lineNumber,
					position.column + 1, // TODO: @legomushroom - can it be empty instead?
				);

				fsNode.children.forEach((child) => {
					// // skip directories without children // TODO: @legomushroom - can it be confusing for users?
					// if (child.isDirectory && !child.children) {
					// 	return;
					// }

					const sortTextPrefix = child.isDirectory ? '1' : '2';

					// const insertText = child.isDirectory ? `${child.name}/` : child.name;

					result.suggestions.push({
						range,
						insertText: child.name,
						label: child.name,
						detail: child.isDirectory ? 'directory' : 'file',
						kind: child.isDirectory ? CompletionItemKind.Folder : CompletionItemKind.File,
						sortText: `${sortTextPrefix}_${child.name}`,
						additionalTextEdits: [{
							range: new Range(
								position.lineNumber,
								linkToken.range.startColumn,
								position.lineNumber,
								linkToken.range.endColumn,
							),
							text: child.name,
						}],
						// commitCharacters: child.isDirectory ? ['/'] : undefined,
					});
				});

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
