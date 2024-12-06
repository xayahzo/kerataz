/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { FilePromptParser } from './filePromptParser.js';
import { extUri } from '../../../../base/common/resources.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { FileReference } from './codecs/chatPromptCodec/tokens/fileReference.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';

/**
 * TODO: @legomushroom - list
 *
 *  - create the `EditorPromptParser`
 *  - add the `EditorPromptParser` unit tests
 *  - add comments
 *  - add unit tests
 */

/**
 * TODO: @legomushroom
 */
export class PromptFileReference extends FilePromptParser {
	constructor(
		public readonly token: FileReference,
		dirname: URI,
		seenReferences: string[] = [],
		@IFileService fileService: IFileService,
		@IInstantiationService initService: IInstantiationService,
		@IConfigurationService configService: IConfigurationService,
	) {
		const fileUri = extUri.resolvePath(dirname, token.path);
		super(fileUri, seenReferences, fileService, initService, configService);
	}
}
