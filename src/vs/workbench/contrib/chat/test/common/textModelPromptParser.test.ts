/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isWindows } from '../../../../../base/common/platform.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { TextModelPromptParser } from '../../common/textModelPromptParser.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { createModelServices, instantiateTextModel } from '../../../../../editor/test/common/testTextModel.js';

/**
 * Helper function that allows to await for a specified amount of time.
 * @param ms The amount of time to wait in milliseconds.
 * TODO: @legomushroom - move to a common utility
 */
const wait = (ms: number): Promise<void> => {
	return new Promise(resolve => setTimeout(resolve, ms));
};

suite('TextModelPromptParser (Unix)', function () {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves nested file references', async function () {
		if (isWindows) {
			this.skip();
		}

		const disposables = new DisposableStore();
		const instantiationService = createModelServices(disposables);
		const model = instantiateTextModel(instantiationService, 'My First Line\r\nMy \t#file:./some-file.md Line\r\nMy Third Line');
		model.registerDisposable(disposables);

		const nullLogService = testDisposables.add(new NullLogService());
		const nullFileService = testDisposables.add(new FileService(nullLogService));

		instantiationService.stub(IFileService, nullFileService);

		testDisposables.add(model);

		await wait(100);

		const parser = testDisposables.add(
			instantiationService.createInstance(TextModelPromptParser, model, []),
		);

		parser.start();

		// TODO: @legomushroom - add description
		await wait(100);

		const tokens = parser.tokens;

		assert(
			tokens.length === 1,
			`Expected 1 token, but got ${tokens.length}.`,
		);
	});
});
