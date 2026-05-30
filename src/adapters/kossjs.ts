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

import { KOSSJS_MAP } from '../types/mapping';
import { FFIError } from '../errors';

declare var globalThis: any;

export class KossJSAdapter {
  private _ffi: any;
  private _libs: Map<any, any>;

  constructor() {
    const ffi = globalThis._senri_ffi;
    if (!ffi) throw new FFIError('_senri_ffi not found in global scope');
    this._ffi = ffi;
    this._libs = new Map();
  }

  mapType(unifiedType: any): any {
    if (typeof unifiedType === 'string') {
      const mapped = KOSSJS_MAP[unifiedType];
      if (!mapped) throw new FFIError('Unknown type: ' + unifiedType);
      return mapped;
    }
    return unifiedType;
  }

  createLibrary(path: string): any {
    const lib = this._ffi.open(path);
    this._libs.set(lib, lib);
    return lib;
  }

  closeLibrary(handle: any): void {
    if (handle && typeof handle.close === 'function') {
      handle.close();
      this._libs.delete(handle);
    }
  }

  bindFunction(libHandle: any, name: string, retType: any, argTypes: any[], _options?: any): any {
    if (!libHandle || typeof libHandle.func !== 'function') {
      throw new FFIError('Invalid library handle');
    }
    return libHandle.func(name, retType, argTypes);
  }

  createStructType(fields: Record<string, any>, packed?: number, _size?: number, _align?: number): any {
    const fieldTypes = Object.values(fields);
    return this._ffi.struct(fieldTypes, { packed });
  }

  createPointerType(innerType: any): any {
    return this._ffi.pointer(innerType);
  }

  createArrayType(innerType: any, length: number): any {
    return this._ffi.array(innerType, length);
  }

  allocMemory(size: number): any {
    return this._ffi.alloc(size);
  }

  freeMemory(ptr: any): void {
    this._ffi.free(ptr);
  }

  getAddressOf(buffer: any): any {
    return this._ffi.addressOf(buffer);
  }

  createCallback(retType: any, argTypes: any[], jsFn: Function, _options?: any): any {
    return this._ffi.createCallback(retType, argTypes, jsFn);
  }

  releaseCallback(ptr: any): void {
    if (this._ffi.free) this._ffi.free(ptr);
  }

  getErrno(): number {
    return this._ffi.errno();
  }

  getStrerror(errno: number): string {
    return this._ffi.strerror(errno);
  }
}
