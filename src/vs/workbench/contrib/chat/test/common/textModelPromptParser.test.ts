/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { Schemas } from '../../../../../base/common/network.js';
import { extUri } from '../../../../../base/common/resources.js';
import { randomInt } from '../../../../../base/common/numbers.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { TErrorCondition } from '../../common/basePromptParser.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IPromptFileReference } from '../../common/basePromptTypes.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { TextModelPromptParser } from '../../common/textModelPromptParser.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { FileReference } from '../../common/codecs/chatPromptCodec/tokens/fileReference.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { createModelServices, instantiateTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { FileOpenFailed } from '../../common/promptFileReferenceErrors.js';

/**
 * Helper function that allows to await for a specified amount of time.
 * @param ms The amount of time to wait in milliseconds.
 * TODO: @legomushroom - move to a common utility
 */
const wait = (ms: number): Promise<void> => {
	return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Helper function that allows to await for a random amount of time.
 * @param maxMs The `maximum` amount of time to wait, in milliseconds.
 * @param minMs [`optional`] The `minimum` amount of time to wait, in milliseconds.
 * TODO: @legomushroom - move to a common utility
 */
const waitRandom = (maxMs: number, minMs: number = 0): Promise<void> => {
	return wait(randomInt(maxMs, minMs));
};

/**
 * Represents a file reference with an expected
 * error condition value for testing purposes.
 * TODO: @legomushroom - move to a common utility
 */
class ExpectedReference {
	/**
	 * URI component of the expected reference.
	 */
	public readonly uri: URI;

	constructor(
		dirname: URI,
		public readonly lineToken: FileReference,
		public readonly errorCondition?: TErrorCondition,
	) {
		this.uri = extUri.resolvePath(dirname, lineToken.path);
	}

	/**
	 * String representation of the expected reference.
	 */
	public toString(): string {
		return `#file:${this.uri.path}`;
	}
}


/**
 * A reusable test utility to test the `TextModelParser` class.
 */
class TestTextModelParser extends Disposable {
	/**
	 * Reference to the test instance of the the `TextModel`.
	 */
	private readonly model: ITextModel;

	constructor(
		modelUri: URI,
		private readonly modelContent: string,
		private readonly expectedReferences: ExpectedReference[],
		@IInstantiationService private readonly initService: IInstantiationService,
		@IFileService private readonly fileService: IFileService,
	) {
		super();

		// create in-memory file system
		const fileSystemProvider = this._register(new InMemoryFileSystemProvider());
		this._register(this.fileService.registerProvider(Schemas.file, fileSystemProvider));

		this.model = this._register(instantiateTextModel(
			initService,
			this.modelContent,
			null,
			undefined,
			modelUri,
		));
	}

	/**
	 * Directory containing the test model.
	 */
	public get dirname(): URI {
		return extUri.dirname(this.model.uri);
	}

	/**
	 * Run the test.
	 */
	public async run() {

		// TODO: @legomushroom - add description
		// TODO: @legomushroom - test without the delay
		await waitRandom(5);

		// start resolving references for the specified root file
		const parser = this._register(
			this.initService.createInstance(
				TextModelPromptParser,
				this.model,
				[],
			),
		).start();

		// TODO: @legomushroom - add description
		await wait(100);

		// resolve the root file reference including all nested references
		const resolvedReferences: readonly (IPromptFileReference | undefined)[] = parser.tokensTree;

		for (let i = 0; i < this.expectedReferences.length; i++) {
			const expectedReference = this.expectedReferences[i];
			const resolvedReference = resolvedReferences[i];

			assert(
				(resolvedReference) &&
				(resolvedReference.uri.toString() === expectedReference.uri.toString()),
				[
					`Expected ${i}th resolved reference URI to be '${expectedReference.uri}'`,
					`got '${resolvedReference?.uri}'.`,
				].join(', '),
			);

			// assert(
			// 	resolvedReference.token.equals(expectedReference.lineToken),
			// 	[
			// 		`Expected ${i}th resolved reference token to be '${expectedReference.lineToken}'`,
			// 		`got '${resolvedReference.token}'.`,
			// 	].join(', '),
			// );

			if (expectedReference.errorCondition === undefined) {
				assert(
					resolvedReference.errorCondition === undefined,
					[
						`Expected ${i}th error condition to be 'undefined'`,
						`got '${resolvedReference.errorCondition}'.`,
					].join(', '),
				);
				continue;
			}

			assert(
				expectedReference.errorCondition.equal(resolvedReference.errorCondition),
				[
					`Expected ${i}th error condition to be '${expectedReference.errorCondition}'`,
					`got '${resolvedReference.errorCondition}'.`,
				].join(', '),
			);
		}

		assert.strictEqual(
			resolvedReferences.length,
			this.expectedReferences.length,
			[
				`\nExpected(${this.expectedReferences.length}): [\n ${this.expectedReferences.join('\n ')}\n]`,
				`Received(${resolvedReferences.length}): [\n ${resolvedReferences.join('\n ')}\n]`,
			].join('\n')
		);
	}
}

/**
 * Create expected file reference for testing purposes.
 *
 * @param filePath The expected path of the file reference (without the `#file:` prefix).
 * @param lineNumber The expected line number of the file reference.
 * @param startColumnNumber The expected start column number of the file reference.
 * TODO: @legomushroom - move to a common utility
 */
const createTestFileReference = (
	filePath: string,
	lineNumber: number,
	startColumnNumber: number,
): FileReference => {
	const range = new Range(
		lineNumber,
		startColumnNumber,
		lineNumber,
		startColumnNumber + `#file:${filePath}`.length,
	);

	return new FileReference(range, filePath);
};

suite('TextModelPromptParser (Unix)', function () {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves nested file references', async function () {
		if (isWindows) {
			this.skip();
		}

		const disposables = testDisposables.add(new DisposableStore());
		const instantiationService = createModelServices(disposables);

		const nullLogService = testDisposables.add(new NullLogService());
		const nullFileService = testDisposables.add(new FileService(nullLogService));
		instantiationService.stub(IFileService, nullFileService);

		const rootUri = URI.file('/root');

		const test = testDisposables.add(instantiationService.createInstance(
			TestTextModelParser,
			extUri.joinPath(rootUri, 'file.txt'),
			`My First Line\r\nMy \t#file:./some-file.md Line\t\t some content\t#file:/root/some-file.md\r\nMy Third Line`,
			[
				new ExpectedReference(
					rootUri,
					createTestFileReference('./some-file.md', 2, 4),
					new FileOpenFailed(
						URI.joinPath(rootUri, './some-file.md'),
						'Failed to open file',
					),
				),
				new ExpectedReference(
					rootUri,
					createTestFileReference('./some-file.md', 2, 4),
					new FileOpenFailed(
						URI.joinPath(rootUri, './some-file.md'),
						'Failed to open file',
					),
				),
			],
		));

		await test.run();
	});
});
