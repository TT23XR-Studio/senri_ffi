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

import { BUN_MAP } from '../types/mapping';
import { FFIError } from '../errors';
import { FFIAdapter } from '../types/adapter';
import { NormalizedType } from '../types/normalized';

declare var Bun: any;
declare var process: any;

export class BunAdapter implements FFIAdapter {
  private static _warnedCString: boolean = false;
  private _isWindows: boolean;

  constructor() {
    if (typeof Bun === 'undefined' || !Bun.FFI) {
      throw new FFIError('Bun.FFI not available');
    }
    this._isWindows = typeof process !== 'undefined' && process.platform === 'win32';
  }

  mapType(type: NormalizedType): any {
    return this._mapTypeRec(type);
  }

  private _cstringType(): string {
    return 'ptr';
  }

  private _mapTypeRec(type: NormalizedType): any {
    switch (type.kind) {
      case 'primitive': {
        if (type.name === 'cstring') return this._cstringType();
        const mapped = BUN_MAP[type.name];
        if (!mapped) throw new FFIError('Unknown type: ' + type.name);
        return mapped;
      }
      case 'pointer':
        return 'ptr';
      case 'array':
        return this._mapTypeRec(type.of);
      case 'struct':
        return 'ptr';
    }
  }

  createPointerType(_ofType: NormalizedType): any { return 'ptr'; }
  createArrayType(ofType: NormalizedType, _length: number): any { return this._mapTypeRec(ofType); }
  createStructType(_fields: Record<string, NormalizedType>, _packed?: number, _size?: number, _align?: number): any { return 'ptr'; }

  loadLibrary(path: string): any {
    try {
      const lib = Bun.FFI.dlopen(path, {});
      return { __path: path, __lib: lib };
    } catch (e: any) {
      throw new FFIError('Failed to load library "' + path + '": ' + e.message);
    }
  }

  closeLibrary(handle: any): void {
    if (!handle) return;
    try { handle.__lib?.close?.(); } catch {}
    handle.__lib = null;
  }

  bindFunction(libHandle: any, name: string, retType: NormalizedType, argTypes: NormalizedType[], _options?: any): any {
    if (!libHandle || !libHandle.__lib) throw new FFIError('Invalid or closed library handle');

    const nativeRet = this._mapTypeRec(retType);
    const nativeArgs = argTypes.map(t => this._mapTypeRec(t));

    const dl = Bun.FFI.dlopen(libHandle.__path, {
      [name]: { returns: nativeRet, args: nativeArgs },
    });
    const fn = dl.symbols ? dl.symbols[name] : dl[name];
    if (!fn) throw new FFIError('Symbol not found: ' + name);

    const hasCStringArg = argTypes.some(t => t.kind === 'primitive' && t.name === 'cstring');
    const returnsCString = retType.kind === 'primitive' && retType.name === 'cstring';
    if (hasCStringArg || returnsCString) {
      const warnOnce = () => {
        if (!BunAdapter._warnedCString) {
          BunAdapter._warnedCString = true;
          console.warn('[SenRi FFI] Bun: cstring type mapped to ptr to avoid crashes. For string returns, raw pointer address is returned as bigint.');
        }
      };
      return (...args: any[]) => {
        warnOnce();
        const converted = args.map((arg: any, i: number) => {
          const t = argTypes[i];
          if (t.kind === 'primitive' && t.name === 'cstring') {
            return new TextEncoder().encode(String(arg) + '\0');
          }
          return arg;
        });
        const raw = fn(...converted);
        if (returnsCString && raw) {
          return raw;
        }
        return raw;
      };
    }

    return fn;
  }

  alloc(size: number): any {
    const buf = new ArrayBuffer(size);
    const u8 = new Uint8Array(buf);
    u8.fill(0);
    const ptr = Bun.FFI.ptr ? Bun.FFI.ptr(buf) : 0;
    return { __ptr: BigInt(typeof ptr === 'bigint' ? ptr : ptr || 0), __buf: buf, __size: size, __u8: u8 };
  }

  free(ptr: any): void {
    if (ptr) { ptr.__buf = null; ptr.__u8 = null; }
  }

  addressOf(buffer: ArrayBuffer | ArrayBufferView): bigint {
    const ptr = Bun.FFI.ptr ? Bun.FFI.ptr(buffer) : 0;
    return BigInt(typeof ptr === 'bigint' ? ptr : ptr || 0);
  }

  registerCallback(func: Function, retType: NormalizedType, argTypes: NormalizedType[]): any {
    try {
      const nativeRet = this._mapTypeRec(retType);
      const nativeArgs = argTypes.map(t => this._mapTypeRec(t));
      const cb = Bun.FFI.Callback({ returns: nativeRet, arguments: nativeArgs }, func);
      const ptr = cb.ptr;
      return { __ptr: BigInt(typeof ptr === 'bigint' ? ptr : ptr || 0), __cb: cb, __size: 0 };
    } catch (e: any) {
      throw new FFIError('Failed to create callback: ' + e.message);
    }
  }

  unregisterCallback(ptr: any): void {
    if (ptr && ptr.__cb) ptr.__cb = null;
  }

  getErrno(): number {
    try { return Bun.FFI.errno || 0; } catch { return 0; }
  }

  getStrerror(errno: number): string {
    if (typeof Bun !== 'undefined' && Bun.FFI && typeof Bun.FFI.strerror === 'function') {
      try { return Bun.FFI.strerror(errno); } catch {}
    }
    return 'Error code: ' + errno;
  }
}
