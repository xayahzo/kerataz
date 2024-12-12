/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertDefined } from '../../../../base/common/types.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';

/**
 * TODO: @legomushroom - move to the correct place
 */

type TWithOptionalCancellationToken<TFunction extends Function> = TFunction extends (...args: infer TArgs) => infer TReturn
	? (...args: [...TArgs, cancellatioNToken?: CancellationToken]) => TReturn
	: never;

type TFunctionDescriptor<
	TArgs extends unknown[],
	TReturn extends unknown,
> = TypedPropertyDescriptor<TWithOptionalCancellationToken<(...args: TArgs) => TReturn>>;

interface IObjectRecord {
	disposables: DisposableStore;
	cts?: CancellationTokenSource;
}

/**
 * TODO: @legomushroom
 */
export function cancelPreviousCalls<
	TObject extends Disposable,
	TArgs extends unknown[],
	TReturn extends unknown,
>(
	_proto: TObject,
	propertyName: string,
	descriptor: TFunctionDescriptor<TArgs, TReturn>,
) {
	const originalMethod = descriptor.value;

	assertDefined(
		originalMethod,
		`Method '${propertyName}' is not defined.`,
	);

	const objectRecords = new WeakMap<TObject, IObjectRecord>();
	descriptor.value = function (
		this: TObject,
		...args: Parameters<typeof originalMethod>
	): ReturnType<typeof originalMethod> {
		let record = objectRecords.get(this);
		if (!record) {
			const disposables = this._register(new DisposableStore());

			disposables.add({
				dispose: () => {
					objectRecords.get(this)
						?.cts
						?.cancel();

					objectRecords.delete(this);
				},
			});

			record = { disposables };
			objectRecords.set(this, record);
		}

		// if this object already has a cancellation token, cancel and dispose it
		if (record.cts) {
			record.cts.dispose(true);
			record.disposables.deleteAndLeak(record.cts);
		}

		// if the last argument is a cancellation token reuse it as parent
		const lastArgument = (args.length > 0)
			? args[args.length - 1]
			: undefined;
		const token = CancellationToken.isCancellationToken(lastArgument)
			? lastArgument
			: undefined;

		// create a new cancellation token source and store it reusing
		record.cts = record.disposables.add(new CancellationTokenSource(token));
		objectRecords.set(this, record);

		// update or add cancelaltion token at the end of the arguments list
		if (CancellationToken.isCancellationToken(lastArgument)) {
			args[args.length - 1] = record.cts.token;
		} else {
			args.push(record.cts.token);
		}

		// if the object is already disposed, call the original
		// method with an cancelled token instead of a valid one
		if (record.disposables.isDisposed) {
			record.cts.cancel();
		}

		// invoke the original method providing the new cancellation token
		return originalMethod.call(this, ...args);
	};

	return descriptor;
}
