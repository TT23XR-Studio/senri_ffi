/*
 * Copyright (c) 2026 TT23XR Studio
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { NormalizedType } from './normalized';
import { FFIAdapter } from './adapter';
import { FFITypeError } from '../errors';

export interface LibraryLike {
  init?(): void;
  destroy?(): void;
  open(path: string): any;
  bind(handle: any, name: string, retType: NormalizedType, argTypes: NormalizedType[]): Function;
  close(handle: any): void;
  alloc(size: number): { __ptr: bigint; __buf: any; __size: number; };
  free(ptr: any): void;
  addressOf(buffer: ArrayBuffer | ArrayBufferView): bigint;
  registerCallback(func: Function, retType: NormalizedType, argTypes: NormalizedType[]): { __ptr: bigint; __cb: any; };
  unregisterCallback(ptr: any): void;
  getErrno(): number;
  getStrerror(errno: number): string;
  bindAsync?(handle: any, name: string, retType: NormalizedType, argTypes: NormalizedType[]): (...args: any[]) => Promise<any>;
}

const MANDATORY_METHODS: (keyof LibraryLike)[] = [
  'open', 'bind', 'close',
  'alloc', 'free', 'addressOf',
  'registerCallback', 'unregisterCallback',
  'getErrno', 'getStrerror',
];

export function isLibraryLike(obj: any): obj is LibraryLike {
  if (!obj || typeof obj !== 'object') return false;
  for (const method of MANDATORY_METHODS) {
    if (typeof obj[method] !== 'function') return false;
  }
  return true;
}

export function getMissingMethods(obj: any): string[] {
  const missing: string[] = [];
  if (!obj || typeof obj !== 'object') return [...MANDATORY_METHODS.map(m => String(m))];
  for (const method of MANDATORY_METHODS) {
    if (typeof obj[method] !== 'function') {
      missing.push(String(method));
    }
  }
  return missing;
}

export type PartialLibraryLike = Partial<LibraryLike>;

export function createBackendWithFallback(
  partial: PartialLibraryLike,
  builtinAdapter: FFIAdapter
): LibraryLike {
  function delegate(method: keyof LibraryLike): any {
    return function (this: any, ...args: any[]) {
      if (typeof partial[method] === 'function') {
        return (partial[method] as any)(...args);
      }
      const builtinMethod = (builtinAdapter as any)[method];
      if (typeof builtinMethod === 'function') {
        return builtinMethod.apply(builtinAdapter, args);
      }
      throw new FFITypeError('Method "' + String(method) + '" not implemented in partial backend or builtin adapter');
    };
  }

  const backend: LibraryLike = {
    open: delegate('open'),
    bind: delegate('bind'),
    close: delegate('close'),
    alloc: delegate('alloc'),
    free: delegate('free'),
    addressOf: delegate('addressOf'),
    registerCallback: delegate('registerCallback'),
    unregisterCallback: delegate('unregisterCallback'),
    getErrno: delegate('getErrno'),
    getStrerror: delegate('getStrerror'),
  };

  if (typeof partial.init === 'function') {
    backend.init = partial.init.bind(partial);
  }
  if (typeof partial.destroy === 'function') {
    backend.destroy = partial.destroy.bind(partial);
  }
  if (typeof partial.bindAsync === 'function') {
    backend.bindAsync = partial.bindAsync.bind(partial);
  }

  return backend;
}
