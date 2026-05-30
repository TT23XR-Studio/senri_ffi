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

export { FFIError, FFITypeError } from './errors';
export { Pointer } from './pointer';
export { struct } from './struct';
export { callback } from './callback';
export { alloc, free, addressOf, errno, strerror } from './memory';
export { Library } from './library';

import { TYPES } from './types/constants';
import { KossJSAdapter } from './adapters/kossjs';
import { NodeAdapter } from './adapters/node';
import { BunAdapter } from './adapters/bun';

import { setCallbackAdapter } from './callback';
import { setMemoryAdapter } from './memory';
import { setLibraryAdapter } from './library';

declare var globalThis: any;
declare var Bun: any;
declare var process: any;

let _adapter: any = null;

function detectRuntime(): any {
  if (typeof globalThis._senri_ffi !== 'undefined' && globalThis._senri_ffi) {
    return new KossJSAdapter();
  }
  if (typeof Bun !== 'undefined' && Bun.ffi) {
    return new BunAdapter();
  }
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    return new NodeAdapter();
  }
  throw new Error('Unsupported JavaScript runtime: expected KossJS, Bun (>=1.0), or Node.js (>=18)');
}

if (!_adapter) {
  _adapter = detectRuntime();
  setCallbackAdapter(_adapter);
  setLibraryAdapter(_adapter);
  setMemoryAdapter(_adapter);
}

export function pointer(type?: any): any {
  return { __senri_type: 'pointer', innerType: type || TYPES.pointer };
}

export function array(type: any, length: number): any {
  return { __senri_type: 'array', innerType: type, length: length || 0 };
}

export const types = Object.freeze({
  void:    TYPES.void,
  int8:    TYPES.int8,
  uint8:   TYPES.uint8,
  int16:   TYPES.int16,
  uint16:  TYPES.uint16,
  int32:   TYPES.int32,
  uint32:  TYPES.uint32,
  int64:   TYPES.int64,
  uint64:  TYPES.uint64,
  float32: TYPES.float32,
  float64: TYPES.float64,
  pointer: TYPES.pointer,
  cstring: TYPES.cstring,
});
