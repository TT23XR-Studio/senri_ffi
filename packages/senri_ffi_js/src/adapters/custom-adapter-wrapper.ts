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

import { FFIAdapter } from '../types/adapter';
import { NormalizedType, serializeType } from '../types/normalized';
import { LibraryLike } from '../types/library-like';
import { FFIError } from '../errors';
import { getResourceRegistry } from '../resource-registry';

declare var process: any;

function isDebug(): boolean {
  return typeof process !== 'undefined' && process.env?.SENRI_FFI_DEBUG === 'true';
}

function wrapError(context: string, e: any): never {
  if (isDebug()) throw e;
  const msg = e instanceof Error ? e.message : String(e);
  const err = new FFIError(context + ': ' + msg);
  if (e instanceof Error) err.cause = e;
  throw err;
}

export class CustomAdapterWrapper implements FFIAdapter {
  readonly _isCustomBackend = true;
  readonly _backend: LibraryLike;

  constructor(backend: LibraryLike) {
    this._backend = backend;
    if (typeof backend.init === 'function') {
      try {
        backend.init();
      } catch (e: any) {
        wrapError('Custom backend init failed', e);
      }
    }
  }

  getBackend(): LibraryLike {
    return this._backend;
  }

  cleanup(): void {
    if (typeof this._backend.destroy === 'function') {
      try {
        this._backend.destroy();
      } catch {
        // silent
      }
    }
  }

  loadLibrary(path: string): any {
    try {
      return this._backend.open(path);
    } catch (e: any) {
      wrapError('Failed to load library "' + path + '"', e);
    }
  }

  closeLibrary(handle: any): void {
    try {
      this._backend.close(handle);
    } catch {
      // silent
    }
  }

  bindFunction(libHandle: any, name: string, retType: NormalizedType, argTypes: NormalizedType[], _options?: any): (...args: any[]) => any {
    try {
      return this._backend.bind(libHandle, name, retType, argTypes) as (...args: any[]) => any;
    } catch (e: any) {
      wrapError('Failed to bind function "' + name + '"', e);
    }
  }

  alloc(size: number): any {
    try {
      const result = this._backend.alloc(size);
      getResourceRegistry().registerMemory(result);
      return result;
    } catch (e: any) {
      wrapError('Failed to allocate ' + size + ' bytes', e);
    }
  }

  free(ptr: any): void {
    getResourceRegistry().unregisterMemory(ptr);
    try {
      this._backend.free(ptr);
    } catch {
      // silent
    }
  }

  addressOf(buffer: ArrayBuffer | ArrayBufferView): bigint {
    try {
      return this._backend.addressOf(buffer);
    } catch (e: any) {
      wrapError('Failed to get address of buffer', e);
    }
  }

  registerCallback(func: Function, retType: NormalizedType, argTypes: NormalizedType[]): any {
    try {
      const result = this._backend.registerCallback(func, retType, argTypes);
      (result as any)._unregister = () => {
        getResourceRegistry().unregisterCallback(result);
        this._backend.unregisterCallback(result);
      };
      getResourceRegistry().registerCallback(result);
      return result;
    } catch (e: any) {
      wrapError('Failed to register callback', e);
    }
  }

  unregisterCallback(ptr: any): void {
    getResourceRegistry().unregisterCallback(ptr);
    try {
      this._backend.unregisterCallback(ptr);
    } catch {
      // silent
    }
  }

  getErrno(): number {
    try {
      return this._backend.getErrno();
    } catch {
      return 0;
    }
  }

  getStrerror(errno: number): string {
    try {
      return this._backend.getStrerror(errno);
    } catch {
      return 'Unknown error';
    }
  }

  mapType(type: NormalizedType): any {
    return serializeType(type);
  }

  createPointerType(ofType: NormalizedType): any {
    const ptrType: NormalizedType = { kind: 'pointer', of: ofType };
    return serializeType(ptrType);
  }

  createArrayType(ofType: NormalizedType, length: number): any {
    const arrType: NormalizedType = { kind: 'array', of: ofType, length };
    return serializeType(arrType);
  }

  createStructType(fields: Record<string, NormalizedType>, packed?: number, size?: number, align?: number): any {
    const structType: NormalizedType = { kind: 'struct', fields, packed, size: size || 0, align: align || 1 };
    return serializeType(structType);
  }
}
