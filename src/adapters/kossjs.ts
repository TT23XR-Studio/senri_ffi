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
import { FFIAdapter } from '../types/adapter';
import { NormalizedType } from '../types/normalized';

declare var globalThis: any;

export class KossJSAdapter implements FFIAdapter {
  private _ffi: any;
  private _libs: Map<any, any>;

  constructor() {
    const ffi = globalThis._senri_ffi;
    if (!ffi) throw new FFIError('_senri_ffi not found in global scope. KossJSAdapter must be used in KossJS runtime.');
    this._ffi = ffi;
    this._libs = new Map();
  }

  mapType(type: NormalizedType): any {
    return this._mapTypeRec(type);
  }

  private _mapTypeRec(type: NormalizedType): any {
    switch (type.kind) {
      case 'primitive': {
        const mapped = KOSSJS_MAP[type.name];
        if (!mapped) throw new FFIError('Unknown type: ' + type.name);
        return mapped;
      }
      case 'pointer':
        return this.createPointerType(type.of);
      case 'array':
        return this.createArrayType(type.of, type.length);
      case 'struct': {
        const fields: Record<string, any> = {};
        for (const [name, ft] of Object.entries(type.fields)) {
          fields[name] = this._mapTypeRec(ft);
        }
        return this.createStructType(fields, type.packed, type.size, type.align);
      }
    }
  }

  createPointerType(ofType: NormalizedType): any {
    return this._ffi.pointer(this._mapTypeRec(ofType));
  }

  createArrayType(ofType: NormalizedType, length: number): any {
    return this._ffi.array(this._mapTypeRec(ofType), length);
  }

  createStructType(fields: Record<string, NormalizedType>, packed?: number, size?: number, align?: number): any {
    const nativeFields: Record<string, any> = {};
    for (const [name, nt] of Object.entries(fields)) {
      nativeFields[name] = this._mapTypeRec(nt);
    }
    return this._ffi.struct(nativeFields, { packed });
  }

  loadLibrary(path: string): any {
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

  bindFunction(libHandle: any, name: string, retType: NormalizedType, argTypes: NormalizedType[], _options?: any): any {
    if (!libHandle || typeof libHandle.func !== 'function') {
      throw new FFIError('Invalid library handle');
    }
    const nativeRet = this.mapType(retType);
    const nativeArgs = argTypes.map(t => this.mapType(t));
    return libHandle.func(name, nativeRet, nativeArgs);
  }

  alloc(size: number): any {
    return this._ffi.alloc(size);
  }

  free(ptr: any): void {
    this._ffi.free(ptr);
  }

  addressOf(buffer: ArrayBuffer | ArrayBufferView): bigint {
    return BigInt(this._ffi.addressOf(buffer));
  }

  registerCallback(func: Function, retType: NormalizedType, argTypes: NormalizedType[]): any {
    const nativeRet = this.mapType(retType);
    const nativeArgs = argTypes.map(t => this.mapType(t));
    return this._ffi.createCallback(nativeRet, nativeArgs, func);
  }

  unregisterCallback(ptr: any): void {
    if (this._ffi.free) this._ffi.free(ptr);
  }

  getErrno(): number {
    return this._ffi.errno();
  }

  getStrerror(errno: number): string {
    return this._ffi.strerror(errno);
  }
}
