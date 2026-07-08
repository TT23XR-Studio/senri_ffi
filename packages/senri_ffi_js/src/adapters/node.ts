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

import { getKoffi, getKoffiMap } from '../types/mapping';
import { FFIError } from '../errors';
import { FFIAdapter } from '../types/adapter';
import { NormalizedType } from '../types/normalized';

export class NodeAdapter implements FFIAdapter {
  private _koffi: any = null;
  private _typeMap: Record<string, any> | null = null;

  private ensureKoffi(): any {
    if (!this._koffi) {
      try { this._koffi = getKoffi(); } catch (e: any) {
        throw new FFIError('koffi is required for Node.js FFI. Install with: npm install koffi');
      }
      this._typeMap = getKoffiMap();
    }
    return this._koffi;
  }

  mapType(type: NormalizedType): any {
    return this._mapTypeRec(type);
  }

  private _mapTypeRec(type: NormalizedType): any {
    this.ensureKoffi();
    switch (type.kind) {
      case 'primitive': {
        const mapped = this._typeMap![type.name];
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
    this.ensureKoffi();
    return this._koffi.pointer ? this._koffi.pointer(this._mapTypeRec(ofType)) : this._koffi.pointer;
  }

  createArrayType(ofType: NormalizedType, length: number): any {
    this.ensureKoffi();
    return this._koffi.array ? this._koffi.array(this._mapTypeRec(ofType), length) : this._mapTypeRec(ofType);
  }

  createStructType(fields: Record<string, NormalizedType>, _packed?: number, _size?: number, _align?: number): any {
    this.ensureKoffi();
    const nativeFields: Record<string, any> = {};
    for (const [name, nt] of Object.entries(fields)) {
      nativeFields[name] = this._mapTypeRec(nt);
    }
    if (this._koffi.struct) return this._koffi.struct(nativeFields);
    return null;
  }

  loadLibrary(path: string): any {
    this.ensureKoffi();
    try { return this._koffi.load(path); }
    catch (e: any) { throw new FFIError('Failed to load library "' + path + '": ' + e.message); }
  }

  closeLibrary(handle: any): void {
    if (handle) {
      try { if (typeof handle.close === 'function') handle.close(); } catch {}
    }
  }

  bindFunction(libHandle: any, name: string, retType: NormalizedType, argTypes: NormalizedType[], _options?: any): any {
    this.ensureKoffi();
    const nativeRet = this.mapType(retType);
    const nativeArgs = argTypes.map(t => this.mapType(t));
    try { return libHandle.func(name, nativeRet, nativeArgs); }
    catch (e: any) { throw new FFIError('Failed to bind function "' + name + '": ' + e.message); }
  }

  alloc(size: number): any {
    this.ensureKoffi();
    const buf = Buffer.allocUnsafe(size);
    const addr = this._koffi.address ? this._koffi.address(buf) : buf;
    return { __ptr: BigInt(addr), __buf: buf, __size: size };
  }

  free(ptr: any): void {
    if (ptr && ptr.__buf) ptr.__buf = null;
  }

  addressOf(buffer: ArrayBuffer | ArrayBufferView): bigint {
    this.ensureKoffi();
    const addr = this._koffi.address ? this._koffi.address(buffer) : buffer;
    return BigInt(addr);
  }

  registerCallback(func: Function, retType: NormalizedType, argTypes: NormalizedType[]): any {
    this.ensureKoffi();
    const nativeRet = this.mapType(retType);
    const nativeArgs = argTypes.map(t => this.mapType(t));
    try {
      const cb = this._koffi.callback(nativeRet, nativeArgs, func);
      const ptr = this._koffi.address ? this._koffi.address(cb) : cb;
      return { __ptr: BigInt(ptr), __cb: cb, __size: 0 };
    } catch (e: any) {
      throw new FFIError('Failed to create callback: ' + e.message);
    }
  }

  unregisterCallback(ptr: any): void {
    if (ptr && ptr.__cb) ptr.__cb = null;
  }

  private _errnoLib: any = null;

  private ensureErrnoLib(): any {
    if (this._errnoLib) return this._errnoLib;
    this.ensureKoffi();
    try {
      const libName = process.platform === 'win32' ? 'msvcrt.dll'
        : process.platform === 'darwin' ? 'libSystem.B.dylib'
        : 'libc.so.6';
      this._errnoLib = this._koffi.load(libName);
    } catch {
      return null;
    }
    return this._errnoLib;
  }

  getErrno(): number {
    const lib = this.ensureErrnoLib();
    if (!lib) return 0;
    try {
      const getErrnoPtr = lib.func(
        process.platform === 'win32' ? '_errno' : '__errno_location',
        'pointer', []
      );
      const ptr = getErrnoPtr();
      const errnoVal = this._koffi.decode(ptr, 'int');
      return errnoVal;
    } catch {
      return 0;
    }
  }

  getStrerror(errno: number): string {
    const lib = this.ensureErrnoLib();
    if (!lib) return 'Error code: ' + errno;
    try {
      const strerror = lib.func('strerror', 'string', ['int']);
      return strerror(errno);
    } catch {
      return 'Error code: ' + errno;
    }
  }
}
