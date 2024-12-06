/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertDefined } from '../../../../base/common/types.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { CancellationError } from '../../../../base/common/errors.js';

/**
 * TODO: @legomushroom - move to the correct place
 */

/**
 * Type for an `async` function that resolves a `disposable` object.
 */
type TAsyncFunction<
	TReturn extends Disposable,
	TArgs extends unknown[],
> = (...args: TArgs) => Promise<TReturn>;

/**
 * Type for a `descriptor` of an `async function` that
 * resolves a disposable object.
 */
type TAsyncFunctionDescriptor<
	TReturn extends Disposable,
	TArgs extends unknown[],
> = TypedPropertyDescriptor<TAsyncFunction<TReturn, TArgs>>;

/**
 * Type for a `disposable` with a public `disposed` attribute available.
 */
type TTrackedDisposable = Disposable & { disposed: boolean };

/**
 * TODO: @legomushroom
 */
class StrictPromise<TReturn extends Disposable, TParent extends TTrackedDisposable> extends Promise<TReturn> {
	constructor(
		executor: (resolve: (value: TReturn | PromiseLike<TReturn>) => void, reject: (reason?: any) => void) => void,
		private readonly parent: TParent,
	) {
		super(executor);
	}

	public override then<TResult1 = TReturn, TResult2 = never>(onfulfilled?: ((value: TReturn) => TResult1 | PromiseLike<TResult1>) | null | undefined, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null | undefined): Promise<TResult1 | TResult2> {
		if (typeof onfulfilled !== 'function') {
			return super.then(onfulfilled, onrejected);
		}

		const newOnfulfilled = function (this: StrictPromise<TReturn, TParent>, value: TReturn) {
			if (this.parent.disposed) {
				value.dispose();

				throw new CancellationError();
			}

			assertDefined(
				onfulfilled,
				'The `onfulfilled` function is not defined.',
			);

			return onfulfilled(value);
		};

		return super.then(newOnfulfilled.bind(this), onrejected);
	}
}

/**
 * TODO: @legomushroom
 */
export function cancelOnDispose<
	TObject extends TTrackedDisposable,
	TReturn extends Disposable,
	TArgs extends unknown[],
>(
	_proto: TObject,
	propertyName: string,
	descriptor: TAsyncFunctionDescriptor<TReturn, TArgs>,
) {
	const originalMethod = descriptor.value;

	assertDefined(
		originalMethod,
		`Method '${propertyName}' is not defined.`,
	);

	descriptor.value = function (this: TObject, ...args: TArgs): StrictPromise<TReturn, TObject> {
		return new StrictPromise((resolve, reject) => {
			originalMethod.apply(this, args)
				.then((result) => {
					if (this.disposed) {
						result.dispose();

						reject(new CancellationError());
					}

					resolve(result);
				})
				.catch((error) => {
					reject(error);
				});
		}, this);
	};

	return descriptor;
}
