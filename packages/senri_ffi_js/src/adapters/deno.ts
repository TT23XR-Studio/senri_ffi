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

import { FFIError } from '../errors';
import { FFIAdapter } from '../types/adapter';
import { NormalizedType } from '../types/normalized';

declare var Deno: any;

const DENO_MAP: Record<string, string> = {
  void:    'void',
  int8:    'i8',
  uint8:   'u8',
  int16:   'i16',
  uint16:  'u16',
  int32:   'i32',
  uint32:  'u32',
  int64:   'i64',
  uint64:  'u64',
  float32: 'f32',
  float64: 'f64',
  pointer: 'pointer',
  cstring: 'buffer',
};

export class DenoAdapter implements FFIAdapter {
  constructor() {
    if (typeof Deno === 'undefined' || !Deno.dlopen) {
      throw new FFIError('Deno.dlopen not available');
    }
  }

  private _mapTypeRec(type: NormalizedType): any {
    switch (type.kind) {
      case 'primitive': {
        const mapped = DENO_MAP[type.name];
        if (!mapped) throw new FFIError('Unknown type: ' + type.name);
        return mapped;
      }
      case 'pointer':
        return 'pointer';
      case 'array':
        return { kind: 'array', of: this._mapTypeRec(type.of), length: type.length };
      case 'struct':
        return 'pointer';
    }
  }

  mapType(type: NormalizedType): any { return this._mapTypeRec(type); }
  createPointerType(_ofType: NormalizedType): any { return 'pointer'; }
  createArrayType(ofType: NormalizedType, length: number): any { return { kind: 'array', of: this._mapTypeRec(ofType), length }; }
  createStructType(_fields: Record<string, NormalizedType>, _packed?: number, _size?: number, _align?: number): any { return 'pointer'; }

  loadLibrary(path: string): any {
    try {
      const handle = Deno.dlopen(path, {});
      return { __handle: handle, __path: path };
    } catch (e: any) {
      throw new FFIError('Failed to load library "' + path + '": ' + e.message);
    }
  }

  closeLibrary(handle: any): void {
    if (handle && handle.__handle && typeof handle.__handle.close === 'function') {
      handle.__handle.close();
    }
  }

  bindFunction(libHandle: any, name: string, retType: NormalizedType, argTypes: NormalizedType[], _options?: any): any {
    const nativeRet: string = this._mapTypeRec(retType);
    const nativeArgs: string[] = argTypes.map(t => this._mapTypeRec(t));

    const symbolDef: any = {
      parameters: nativeArgs.filter((a: any) => typeof a === 'string'),
      result: nativeRet,
    };

    const path: string = libHandle?.__path || libHandle?.path || '';
    if (!path) throw new FFIError('Invalid library handle: missing path');

    const reopened = Deno.dlopen(path, { [name]: symbolDef });
    const fn = reopened.symbols[name];
    if (!fn) throw new FFIError('Symbol not found: ' + name);

    const needsStringArgs = argTypes.some(t => t.kind === 'primitive' && t.name === 'cstring');
    const returnsCString = retType.kind === 'primitive' && retType.name === 'cstring';
    const hasPointerArgs = argTypes.some(t => (t.kind === 'primitive' && t.name === 'pointer') || t.kind === 'pointer');
    const returnsPointer = (retType.kind === 'primitive' && retType.name === 'pointer') || retType.kind === 'pointer';

    if (needsStringArgs || hasPointerArgs || returnsCString || returnsPointer) {
      return (...args: any[]) => {
        const convertedArgs: any[] = [];
        for (let i = 0; i < args.length; i++) {
          const t = argTypes[i];
          if (t.kind === 'primitive' && t.name === 'cstring') {
            if (args[i] == null) {
              convertedArgs.push(null);
            } else {
              const str = String(args[i]);
              const enc = new TextEncoder().encode(str + '\0');
              convertedArgs.push(enc);
            }
          } else if ((t.kind === 'primitive' && t.name === 'pointer') || t.kind === 'pointer') {
            const val = args[i];
            if (val == null) {
              convertedArgs.push(null);
            } else if (typeof val === 'bigint') {
              if (val === 0n && args[i] && typeof args[i] === 'object' && (args[i]._data?.__buf || args[i]._buffer)) {
                const buf = args[i]._data?.__buf || args[i]._buffer;
                convertedArgs.push(Deno.UnsafePointer.of(buf));
              } else {
                convertedArgs.push(val === 0n ? null : Deno.UnsafePointer.create(val));
              }
            } else if (typeof val === 'object' && val._buffer instanceof ArrayBuffer) {
              convertedArgs.push(Deno.UnsafePointer.of(val._buffer));
            } else if (typeof val === 'object' && typeof val.address === 'bigint') {
              const addr = val.address;
              if (addr === 0n && val._data?.__buf) {
                convertedArgs.push(Deno.UnsafePointer.of(val._data.__buf));
              } else {
                convertedArgs.push(addr === 0n ? null : Deno.UnsafePointer.create(addr));
              }
            } else {
              convertedArgs.push(Deno.UnsafePointer.create(BigInt(val)));
            }
          } else {
            convertedArgs.push(args[i]);
          }
        }
        const result = fn(...convertedArgs);
        if (returnsPointer && result != null) {
          return Deno.UnsafePointer.value(result);
        }
        if (returnsCString && result != null) {
          const arr = new Uint8Array(result.buffer, result.byteOffset, result.byteLength);
          let end = 0;
          while (end < arr.length && arr[end] !== 0) end++;
          return new TextDecoder().decode(arr.slice(0, end));
        }
        return result;
      };
    }

    return fn;
  }

  alloc(size: number): any {
    const buf = new ArrayBuffer(size);
    new Uint8Array(buf).fill(0);
    const ptr = Deno.UnsafePointer.of(buf);
    return { __ptr: ptr ? Deno.UnsafePointer.value(ptr) : 0n, __buf: buf, __size: size };
  }

  free(ptr: any): void {
    if (ptr && ptr.__buf) ptr.__buf = null;
  }

  addressOf(buffer: ArrayBuffer | ArrayBufferView): bigint {
    const ptr = Deno.UnsafePointer.of(buffer);
    return ptr ? Deno.UnsafePointer.value(ptr) : 0n;
  }

  registerCallback(func: Function, retType: NormalizedType, argTypes: NormalizedType[]): any {
    try {
      const nativeRet = this._mapTypeRec(retType);
      const nativeArgs = argTypes.map(t => this._mapTypeRec(t));
      const cb = new Deno.UnsafeCallback(
        {
          parameters: nativeArgs.filter((a: any) => typeof a === 'string'),
          result: nativeRet,
        } as any,
        func as any,
      );
      return {
        __ptr: cb ? Deno.UnsafePointer.value(cb.pointer()) : 0n,
        __cb: cb,
        __size: 0,
      };
    } catch (e: any) {
      throw new FFIError('Failed to create callback: ' + e.message);
    }
  }

  unregisterCallback(ptr: any): void {
    if (ptr && ptr.__cb && typeof ptr.__cb.close === 'function') {
      ptr.__cb.close();
    }
    if (ptr) ptr.__cb = null;
  }

  private _sysLib: any = null;

  private ensureSysLib(): any {
    if (this._sysLib) return this._sysLib;
    try {
      const libName = Deno.build.os === 'windows' ? 'msvcrt.dll'
        : Deno.build.os === 'darwin' ? 'libSystem.B.dylib'
        : 'libc.so.6';
      this._sysLib = Deno.dlopen(libName, {});
    } catch {
      return null;
    }
    return this._sysLib;
  }

  getErrno(): number {
    const lib = this.ensureSysLib();
    if (!lib) return 0;
    try {
      const errnoFnName = Deno.build.os === 'windows' ? '_errno' : '__errno_location';
      const reopened = Deno.dlopen(
        Deno.build.os === 'windows' ? 'msvcrt.dll'
          : Deno.build.os === 'darwin' ? 'libSystem.B.dylib'
          : 'libc.so.6',
        { [errnoFnName]: { parameters: [], result: 'pointer' } }
      );
      const ptr = reopened.symbols[errnoFnName]();
      const errnoVal = Deno.UnsafePointer.value(ptr);
      return Number(errnoVal);
    } catch {
      return 0;
    }
  }

  getStrerror(errno: number): string {
    const lib = this.ensureSysLib();
    if (!lib) return 'Error code: ' + errno;
    try {
      const reopened = Deno.dlopen(
        Deno.build.os === 'windows' ? 'msvcrt.dll'
          : Deno.build.os === 'darwin' ? 'libSystem.B.dylib'
          : 'libc.so.6',
        { strerror: { parameters: ['i32'], result: 'pointer' } }
      );
      const ptr = reopened.symbols.strerror(errno);
      const arr = new Uint8Array(Deno.UnsafePointer.view(ptr, 256));
      let end = 0;
      while (end < arr.length && arr[end] !== 0) end++;
      return new TextDecoder().decode(arr.slice(0, end));
    } catch {
      return 'Error code: ' + errno;
    }
  }
}
