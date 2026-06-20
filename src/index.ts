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
export type { FFIAdapter } from './types/adapter';
export type { NormalizedType, PrimitiveName } from './types/normalized';

import { TYPES } from './types/constants';
import { FFIAdapter } from './types/adapter';
import { KossJSAdapter } from './adapters/kossjs';
import { NodeAdapter } from './adapters/node';
import { BunAdapter } from './adapters/bun';
import { DenoAdapter } from './adapters/deno';

import { setCallbackAdapter } from './callback';
import { setMemoryAdapter } from './memory';
import { setLibraryAdapter } from './library';
import { setStructAlloc } from './struct';

declare var KossJS: { runtime: 'KossJS', version: string } | undefined;
declare var Bun: any;
declare var process: any;
declare var Deno: any;

let _adapter: FFIAdapter | null = null;

function detectRuntime(): FFIAdapter {
  if (typeof KossJS !== 'undefined' && KossJS.runtime === 'KossJS') {
    return new KossJSAdapter();
  }
  if (typeof Bun !== 'undefined' && Bun.FFI) {
    return new BunAdapter();
  }
  if (typeof Deno !== 'undefined' && Deno.dlopen) {
    return new DenoAdapter();
  }
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    return new NodeAdapter();
  }
  throw new Error('Unsupported JavaScript runtime: expected KossJS, Bun (>=1.0), Deno, or Node.js (>=18)');
}

if (!_adapter) {
  _adapter = detectRuntime();
  setCallbackAdapter(_adapter);
  setLibraryAdapter(_adapter);
  setMemoryAdapter(_adapter);
  setStructAlloc(
    (size: number) => _adapter!.alloc(size),
    (ptr: any) => _adapter!.free(ptr),
  );
}

export interface PointerDescriptor {
  __senri_type: 'pointer';
  innerType: any;
}

export interface ArrayDescriptor {
  __senri_type: 'array';
  innerType: any;
  length: number;
}

export function pointer(type?: any): PointerDescriptor {
  return { __senri_type: 'pointer', innerType: type || TYPES.void };
}

export function array(type: any, length: number): ArrayDescriptor {
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
