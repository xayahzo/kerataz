/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { PromptLine, TPromptPart } from './promptLine.js';
import { assert } from '../../../../base/common/assert.js';
import { Emitter } from '../../../../base/common/event.js';
import { PromptFileReference } from './promptFileReference.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Location } from '../../../../editor/common/languages.js';
import { ReadableStream } from '../../../../base/common/stream.js';
import { BaseDecoder } from '../../../../base/common/codecs/baseDecoder.js';
import { FileReference } from './codecs/chatPromptCodec/tokens/fileReference.js';
import { Line } from '../../../../editor/common/codecs/linesCodec/tokens/line.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { FileOpenFailed, NotPromptSnippetFile, RecursiveReference, ParseError } from './promptFileReferenceErrors.js';

/**
 * TODO: @legomushroom - move to the correct place
 */

/**
 * Error conditions that may happen during the file reference resolution.
 */
export type TErrorCondition = FileOpenFailed | RecursiveReference | NotPromptSnippetFile;

/**
 * Configuration key for the prompt snippets feature.
 */
const PROMPT_SNIPPETS_CONFIG_KEY: string = 'chat.experimental.prompt-snippets';

/**
 * TODO: @legomushroom
 */
export interface IPromptFileReference {
	uri: URI;
	token: FileReference;
}

/**
 * TODO: @legomushroom
 */
export abstract class BasePromptParser extends Disposable {
	public disposed: boolean = false;

	/**
	 * TODO: @legomushroom
	 */
	private readonly lines: Map<number, PromptLine> = new Map();

	/**
	 * The event is fired when nested prompt snippet references are updated, if any.
	 */
	private readonly _onUpdate = this._register(new Emitter<void>());

	/**
	 * Subscribe to the `onUpdate`.
	 * @param callback The callback function to be called on updates.
	 */
	public onUpdate(callback: () => void): void {
		this._register(this._onUpdate.event(callback));
	}

	private _errorCondition?: ParseError;

	/**
	 * If file reference resolution fails, this attribute will be set
	 * to an error instance that describes the error condition.
	 */
	public get errorCondition(): ParseError | undefined {
		return this._errorCondition;
	}

	/**
	 * Whether file reference resolution was attempted at least once.
	 */
	private _resolveAttempted: boolean = false;

	/**
	 * Whether file references resolution failed.
	 * Set to `undefined` if the `resolve` method hasn't been ever called yet.
	 */
	public get resolveFailed(): boolean | undefined {
		if (!this._resolveAttempted) {
			return undefined;
		}

		return !!this._errorCondition;
	}

	constructor(
		private readonly promptUri: URI | Location,
		protected readonly onContentChanged: Emitter<ReadableStream<Line> | ParseError>,
		seenReferences: string[] = [],
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IConfigurationService protected readonly configService: IConfigurationService,
	) {
		super();

		// to prevent infinite file recursion, we keep track of all references in
		// the current branch of the file reference tree and check if the current
		// file reference has been already seen before
		if (seenReferences.includes(this.uri.path)) {
			seenReferences.push(this.uri.path);

			this._errorCondition = new RecursiveReference(this.uri, seenReferences);
			this._resolveAttempted = true;
			this._onUpdate.fire();

			return this;
		}

		// we don't care if reading the file fails below, hence can add the path
		// of the current reference to the `seenReferences` set immediately, -
		// even if the file doesn't exist, we would never end up in the recursion
		seenReferences.push(this.uri.path);

		this._onUpdate.fire = this._onUpdate.fire.bind(this._onUpdate);

		this._register(
			this.onContentChanged.event((streamOrError) => {
				this._resolveAttempted = true;

				if (streamOrError instanceof ParseError) {
					this._errorCondition = streamOrError;

					return;
				}

				const stream = streamOrError;

				stream.on('data', (line) => {
					this.parseLine(line, [...seenReferences]);
				});

				stream.on('error', (error) => {
					// console.log(`error: ${error}`);
					stream.destroy();
				});

				stream.on('end', () => {
					stream.destroy();
				});

				if (stream instanceof BaseDecoder) {
					stream.start();
				}
			}),
		);
	}

	/**
	 * Start the prompt parser.
	 */
	public abstract start(): this;

	/**
	 * Associated URI of the prompt.
	 */
	public get uri(): URI {
		return this.promptUri instanceof URI
			? this.promptUri
			: this.promptUri.uri;
	}

	/**
	 * Get the parent folder of the file reference.
	 */
	public get dirname() {
		return URI.joinPath(this.uri, '..');
	}

	/**
	 * TODO: @legomushroom
	 */
	private disposeLine(
		lineNumber: number,
	): this {
		const line = this.lines.get(lineNumber);

		// TODO: @legomushroom - throw if no line found?
		if (!line) {
			return this;
		}

		line.dispose();
		this.lines.delete(lineNumber);

		return this;
	}

	/**
	 * TODO: @legomushroom
	 */
	private parseLine(
		lineToken: Line,
		seenReferences: string[],
	): this {
		const { startLineNumber } = lineToken.range;

		this.disposeLine(startLineNumber);
		this._onUpdate.fire();

		// TODO: @legomushroom - how to better handle the error case?
		assert(
			!this.lines.has(startLineNumber),
			`Must not contain line ${startLineNumber}.`,
		);

		const line = this.instantiationService.createInstance(
			PromptLine,
			lineToken,
			this.dirname,
			[...seenReferences],
		);
		this.lines.set(startLineNumber, line);

		line.onUpdate(this._onUpdate.fire);
		line.start();

		// // TODO: @legomushroom - do we need this?
		// this._onUpdate.fire();

		return this;
	}

	/**
	 * Check if the prompt snippets feature is enabled.
	 * @see {@link PROMPT_SNIPPETS_CONFIG_KEY}
	 */
	public static promptSnippetsEnabled(
		configService: IConfigurationService,
	): boolean {
		const value = configService.getValue(PROMPT_SNIPPETS_CONFIG_KEY);

		if (!value) {
			return false;
		}

		if (typeof value === 'string') {
			return value.trim().toLowerCase() === 'true';
		}

		return !!value;
	}

	/**
	 * TODO: @legomushroom
	 */
	public getTokens(): readonly TPromptPart[] {
		const result = [];

		// TODO: @legomushroom
		// // then add self to the result
		// result.push(this);

		// get getTokensed children references
		for (const line of this.lines.values()) {
			result.push(...line.getTokens());
		}

		return result;
	}

	/**
	 * Get list of all valid file references.
	 */
	public get validFileReferences(): readonly IPromptFileReference[] {
		return this.getTokens()
			// TODO: @legomushroom
			// // skip the root reference itself (this variable)
			// .slice(1)
			// filter out unresolved references
			.filter((reference) => {
				if (reference.resolveFailed) {
					return false;
				}

				// TODO: @legomushroom
				return reference instanceof PromptFileReference;
			});
	}

	/**
	 * Get list of all valid child references as URIs.
	 */
	public get validFileReferenceUris(): readonly URI[] {
		return this.validFileReferences
			.map(child => child.uri);
	}

	/**
	 * Check if the current reference is equal to a given one.
	 * TODO: @legomushroom - reemove?
	 */
	public equals<T extends BasePromptParser>(other: T): boolean {
		if (!this.sameUri(other.uri)) {
			return false;
		}

		return true;
	}

	/**
	 * Returns a string representation of this object.
	 */
	public override toString(): string {
		return `prompt:${this.uri.path}`;
	}

	public override dispose() {
		if (this.disposed) {
			return;
		}

		this.disposed = true;

		for (const line of this.lines.values()) {
			line.dispose();
		}
		this.lines.clear();
		this._onUpdate.fire();

		super.dispose();
	}

	/**
	 * Check if the current reference points to a given resource.
	 */
	public sameUri(otherUri: URI): boolean {
		return this.uri.toString() === otherUri.toString();
	}
}


// /**
//  * Represents a file reference in the chatbot prompt, e.g. `#file:./path/to/file.md`.
//  * Contains logic to resolve all nested file references in the target file and all
//  * referenced child files recursively, if any.
//  *
//  * ## Examples
//  *
//  * ```typescript
//  * const fileReference = new PromptFileReference(
//  * 	 URI.file('/path/to/file.md'),
//  * 	 fileService,
//  * );
//  *
//  * // subscribe to updates to the file reference tree
//  * fileReference.onUpdate(() => {
//  * 	 // .. do something with the file reference tree ..
//  * 	 // e.g. get URIs of all resolved file references in the tree
//  * 	 const resolved = fileReference
//  * 		// get all file references as a flat array
//  * 		.getTokens()
//  * 		// remove self from the list if only child references are needed
//  * 		.slice(1)
//  * 		// filter out unresolved references
//  * 		.filter(reference => reference.resolveFailed === flase)
//  * 		// convert to URIs only
//  * 		.map(reference => reference.uri);
//  *
//  * 	 console.log(resolved);
//  * });
//  *
//  * // *optional* if need to re-resolve file references when target files change
//  * // note that this does not sets up filesystem listeners for nested file references
//  * fileReference.addFilesystemListeners();
//  *
//  * // start resolving the file reference tree; this can also be `await`ed if needed
//  * // to wait for the resolution on the main file reference to complete (the nested
//  * // references can still be resolving in the background)
//  * fileReference.resolve();
//  *
//  * // don't forget to dispose when no longer needed!
//  * fileReference.dispose();
//  * ```
//  */
// export class PromptFileReference extends Disposable {
// 	/**
// 	 * Child references of the current one.
// 	 */
// 	protected readonly children: PromptFileReference[] = [];

// 	private readonly _onUpdate = this._register(new Emitter<void>());
// 	/**
// 	 * The event is fired when nested prompt snippet references are updated, if any.
// 	 */
// 	public readonly onUpdate = this._onUpdate.event;

// 	private _errorCondition?: TErrorCondition;
// 	/**
// 	 * If file reference resolution fails, this attribute will be set
// 	 * to an error instance that describes the error condition.
// 	 */
// 	public get errorCondition(): TErrorCondition | undefined {
// 		return this._errorCondition;
// 	}

// 	/**
// 	 * Check if the prompt snippets feature is enabled.
// 	 * @see {@link PROMPT_SNIPPETS_CONFIG_KEY}
// 	 */
// 	public static promptSnippetsEnabled(
// 		configService: IConfigurationService,
// 	): boolean {
// 		const value = configService.getValue(PROMPT_SNIPPETS_CONFIG_KEY);

// 		if (!value) {
// 			return false;
// 		}

// 		if (typeof value === 'string') {
// 			return value.trim().toLowerCase() === 'true';
// 		}

// 		return !!value;
// 	}

// 	/**
// 	 * Whether file reference resolution was attempted at least once.
// 	 */
// 	private _resolveAttempted: boolean = false;
// 	/**
// 	 * Whether file references resolution failed.
// 	 * Set to `undefined` if the `resolve` method hasn't been ever called yet.
// 	 */
// 	public get resolveFailed(): boolean | undefined {
// 		if (!this._resolveAttempted) {
// 			return undefined;
// 		}

// 		return !!this._errorCondition;
// 	}

// 	constructor(
// 		private readonly _uri: URI | Location,
// 		@IFileService private readonly fileService: IFileService,
// 		@IConfigurationService private readonly configService: IConfigurationService,
// 	) {
// 		super();
// 		this.onFilesChanged = this.onFilesChanged.bind(this);

// 		// make sure the variable is updated on file changes
// 		// but only for the prompt snippet files
// 		if (this.isPromptSnippetFile) {
// 			this.addFilesystemListeners();
// 		}
// 	}

// 	/**
// 	 * Check if the current reference points to a prompt snippet file.
// 	 */
// 	public get isPromptSnippetFile(): boolean {
// 		return this.uri.path.endsWith(PROMP_SNIPPET_FILE_EXTENSION);
// 	}

// 	/**
// 	 * Associated URI of the reference.
// 	 */
// 	public get uri(): URI {
// 		return this._uri instanceof URI
// 			? this._uri
// 			: this._uri.uri;
// 	}

// 	/**
// 	 * Get the parent folder of the file reference.
// 	 */
// 	public get dirname() {
// 		return URI.joinPath(this.uri, '..');
// 	}

// 	/**
// 	 * Check if the current reference points to a given resource.
// 	 */
// 	public sameUri(other: URI | Location): boolean {
// 		const otherUri = other instanceof URI ? other : other.uri;

// 		return this.uri.toString() === otherUri.toString();
// 	}

// 	/**
// 	 * Add file system event listeners for the current file reference.
// 	 */
// 	private addFilesystemListeners(): this {
// 		this._register(
// 			this.fileService.onDidFilesChange(this.onFilesChanged),
// 		);

// 		return this;
// 	}

// 	/**
// 	 * Event handler for the `onDidFilesChange` event.
// 	 */
// 	private onFilesChanged(event: FileChangesEvent) {
// 		const fileChanged = event.contains(this.uri, FileChangeType.UPDATED);
// 		const fileDeleted = event.contains(this.uri, FileChangeType.DELETED);
// 		if (!fileChanged && !fileDeleted) {
// 			return;
// 		}

// 		// if file is changed or deleted, re-resolve the file reference
// 		// in the case when the file is deleted, this should result in
// 		// failure to open the file, so the `errorCondition` field will
// 		// be updated to an appropriate error instance and the `children`
// 		// field will be cleared up
// 		this.resolve();
// 	}

// 	/**
// 	 * Get file stream, if the file exsists.
// 	 */
// 	private async getFileStream(): Promise<IFileStreamContent | null> {
// 		// if URI doesn't point to a prompt snippet file, don't try to resolve it
// 		if (this.uri.path.endsWith(PROMP_SNIPPET_FILE_EXTENSION) === false) {
// 			this._errorCondition = new NotPromptSnippetFile(this.uri);

// 			return null;
// 		}

// 		try {
// 			return await this.fileService.readFileStream(this.uri);
// 		} catch (error) {
// 			this._errorCondition = new FileOpenFailed(this.uri, error);

// 			return null;
// 		}
// 	}

// 	/**
// 	 * Resolve the current file reference on the disk and
// 	 * all nested file references that may exist in the file.
// 	 *
// 	 * @param waitForChildren Whether need to block until all child references are resolved.
// 	 */
// 	public async resolve(
// 		waitForChildren: boolean = false,
// 	): Promise<this> {
// 		return await this.resolveReference(waitForChildren);
// 	}

// 	/**
// 	 * Private implementation of the {@link resolve} method, that allows
// 	 * to pass `seenReferences` list to the recursive calls to prevent
// 	 * infinite file reference recursion.
// 	 */
// 	private async resolveReference(
// 		waitForChildren: boolean = false,
// 		seenReferences: string[] = [],
// 	): Promise<this> {
// 		// remove current error condition from the previous resolve attempt, if any
// 		delete this._errorCondition;

// 		// dispose current child references, if any exist from a previous resolve
// 		this.disposeChildren();

// 		// to prevent infinite file recursion, we keep track of all references in
// 		// the current branch of the file reference tree and check if the current
// 		// file reference has been already seen before
// 		if (seenReferences.includes(this.uri.path)) {
// 			seenReferences.push(this.uri.path);

// 			this._errorCondition = new RecursiveReference(this.uri, seenReferences);
// 			this._resolveAttempted = true;
// 			this._onUpdate.fire();

// 			return this;
// 		}

// 		// we don't care if reading the file fails below, hence can add the path
// 		// of the current reference to the `seenReferences` set immediately, -
// 		// even if the file doesn't exist, we would never end up in the recursion
// 		seenReferences.push(this.uri.path);

// 		// try to get stream for the contents of the file, it may
// 		// fail to multiple reasons, e.g. file doesn't exist, etc.
// 		const fileStream = await this.getFileStream();
// 		this._resolveAttempted = true;

// 		// failed to open the file, nothing to resolve
// 		if (fileStream === null) {
// 			this._onUpdate.fire();

// 			return this;
// 		}

// 		// get all file references in the file contents
// 		const references = await ChatPromptCodec.decode(fileStream.value).consumeAll();

// 		// recursively resolve all references and add to the `children` array
// 		//
// 		// Note! we don't register the children references as disposables here, because we dispose them
// 		//		 explicitly in the `dispose` override method of this class. This is done to prevent
// 		//       the disposables store to be littered with already-disposed child instances due to
// 		// 		 the fact that the `resolve` method can be called multiple times on target file changes
// 		const childPromises = [];
// 		for (const reference of references) {
// 			const childUri = extUri.resolvePath(this.dirname, reference.path);

// 			const child = new PromptFileReference(
// 				childUri,
// 				this.fileService,
// 				this.configService,
// 			);

// 			// subscribe to child updates
// 			this._register(child.onUpdate(
// 				this._onUpdate.fire.bind(this._onUpdate),
// 			));
// 			this.children.push(child);

// 			// start resolving the child in the background, including its children
// 			// Note! we have to clone the `seenReferences` list here to ensure that
// 			// 		 different tree branches don't interfere with each other as we
// 			//       care about the parent references when checking for recursion
// 			childPromises.push(
// 				child.resolveReference(waitForChildren, [...seenReferences]),
// 			);
// 		}

// 		// if should wait for all children to resolve, block here
// 		if (waitForChildren) {
// 			await Promise.all(childPromises);
// 		}

// 		this._onUpdate.fire();

// 		return this;
// 	}

// 	/**
// 	 * Dispose current child file references.
// 	 */
// 	private disposeChildren(): this {
// 		for (const child of this.children) {
// 			child.dispose();
// 		}

// 		this.children.length = 0;
// 		this._onUpdate.fire();

// 		return this;
// 	}

// 	/**
// 	 * getTokens the current file reference tree into a single array.
// 	 */
// 	public getTokens(): readonly PromptFileReference[] {
// 		const result = [];

// 		// then add self to the result
// 		result.push(this);

// 		// get getTokensed children references first
// 		for (const child of this.children) {
// 			result.push(...child.getTokens());
// 		}

// 		return result;
// 	}

// 	/**
// 	 * Get list of all valid child references.
// 	 */
// 	public get validChildReferences(): readonly PromptFileReference[] {
// 		return this.getTokens()
// 			// skip the root reference itself (this variable)
// 			.slice(1)
// 			// filter out unresolved references
// 			.filter(reference => reference.resolveFailed === false);
// 	}

// 	/**
// 	 * Get list of all valid child references as URIs.
// 	 */
// 	public get validFileReferenceUris(): readonly URI[] {
// 		return this.validChildReferences
// 			.map(child => child.uri);
// 	}

// 	/**
// 	 * Check if the current reference is equal to a given one.
// 	 */
// 	public equals(other: PromptFileReference): boolean {
// 		if (!this.sameUri(other.uri)) {
// 			return false;
// 		}

// 		return true;
// 	}

// 	/**
// 	 * Returns a string representation of this reference.
// 	 */
// 	public override toString() {
// 		return `#file:${this.uri.path}`;
// 	}

// 	public override dispose() {
// 		this.disposeChildren();
// 		super.dispose();
// 	}
// }
