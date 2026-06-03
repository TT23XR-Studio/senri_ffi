/**
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
 * 
 * KossJS TypeScript Interface — Embeddable JavaScript runtime
 * Mirrors kossjs_interface.py using koffi for C ABI bindings.
 *
 * Run: npx tsx src/__tests__/kossjs-ffi.test.ts
 *
 */

/// <reference types="node" />

declare const __dirname: string;
declare const process: any;
declare const Buffer: any;
declare const require: any;

import { existsSync } from 'fs';
import { join } from 'path';
import { platform } from 'os';

const koffi = require('koffi');

// Use 'void *' NOT 'string' — koffi 'string' replaces the C pointer, causing
// koss_free_result to double-free / corrupt heap. Python ctypes.c_char_p
// works because it preserves the original pointer in struct memory.
const KossResult = koffi.struct({ code: 'int32', value: 'void *' });

const RESULT_OK = 0;
const RESULT_ERROR = 1;
const KOSS_CAP_ALL = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4);

function findLibrary(): string {
  let candidates: string[] = [];
  if (platform() === 'win32') {
    candidates = [
      join(__dirname, 'kossjs.dll'),
      join(process.cwd(), 'kossjs.dll'),
      join(process.cwd(), 'src', '__tests__', 'kossjs.dll'),
    ];
  } else if (platform() === 'darwin') {
    candidates = [
      join(__dirname, 'kossjs.dylib'),
      join(process.cwd(), 'kossjs.dylib'),
      join(process.cwd(), 'src', '__tests__', 'kossjs.dylib'),
    ];
  } else {
    candidates = [
      join(__dirname, 'kossjs.so'),
      join(process.cwd(), 'kossjs.so'),
      join(process.cwd(), 'src', '__tests__', 'kossjs.so'),
    ];
  }
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error('kossjs library not found');
}

export class JsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JsError';
  }
}

export class KossJS {
  static readonly RESULT_OK = RESULT_OK;
  static readonly RESULT_ERROR = RESULT_ERROR;
  static readonly KOSS_CAP_ALL = KOSS_CAP_ALL;

  private _lib: any;
  private _ptr: any;
  private _eval: Function;
  private _freeResult: Function;
  private _destroy: Function;
  private _version: Function;
  private _msvcrt: any;
  private _strlen: Function;
  private _memcpy: Function;

  constructor(libPath?: string) {
    const dllPath = libPath || findLibrary();
    this._lib = koffi.load(dllPath);

    this._eval = this._lib.func('koss_eval', KossResult, ['void *', 'string']);
    this._freeResult = this._lib.func('koss_free_result', 'void', [KossResult]);
    this._destroy = this._lib.func('koss_destroy', 'void', ['void *']);
    this._version = this._lib.func('koss_version', 'string', []);

    const createFn = this._lib.func('koss_create_with_modules_and_caps', 'void *', ['string', 'uint32']);
    this._ptr = createFn('.', KOSS_CAP_ALL);
    if (!this._ptr) throw new Error('Failed to create KossJS instance');

    const crtName = process.platform === 'win32' ? 'msvcrt' : 'libc.so.6';
    this._msvcrt = koffi.load(crtName);
    this._strlen = this._msvcrt.func('strlen', 'int32', ['void *']);
    this._memcpy = this._msvcrt.func('memcpy', 'void *', ['void *', 'void *', 'int32']);
  }

  private _readCString(ptr: any): string {
    if (!ptr) return '';
    const len: number = this._strlen(ptr);
    if (len <= 0) return '';
    const buf = Buffer.alloc(len + 1);
    const addr = koffi.address ? koffi.address(buf) : BigInt(0);
    this._memcpy(addr, ptr, len + 1);
    const end = buf.indexOf(0);
    return buf.toString('utf-8', 0, end >= 0 ? end : len);
  }

  private _checkResult(result: any): string {
    const rawPtr = result.value;
    const value = this._readCString(rawPtr);
    const code: number = result.code;
    this._freeResult(result);
    if (code === RESULT_OK) return value;
    if (code === RESULT_ERROR) throw new JsError(value);
    throw new Error('Invalid argument: ' + value);
  }

  eval(code: string): any {
    const result = this._eval(this._ptr, code);
    const value = this._checkResult(result);
    if (value && (value[0] === '{' || value[0] === '[')) {
      try { return JSON.parse(value); } catch {}
    }
    return value;
  }

  version(): string {
    return this._version();
  }

  destroy(): void {
    if (this._ptr) {
      this._destroy(this._ptr);
      this._ptr = null;
    }
  }
}
