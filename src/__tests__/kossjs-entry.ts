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
 *
 * KossJS-only entry point for esbuild bundling.
 * Excludes Node/Bun/Deno adapters to avoid native addon dependencies.
 */

export { FFIError, FFITypeError } from '../errors';
export { Pointer } from '../pointer';
export { struct } from '../struct';
export { callback } from '../callback';
export { alloc, free, addressOf, errno, strerror } from '../memory';
export { Library } from '../library';
export type { FFIAdapter } from '../types/adapter';
export type { NormalizedType, PrimitiveName } from '../types/normalized';

import { TYPES } from '../types/constants';
import { FFIError } from '../errors';
import { KossJSAdapter } from '../adapters/kossjs';
import { setCallbackAdapter } from '../callback';
import { setMemoryAdapter } from '../memory';
import { setLibraryAdapter } from '../library';

declare var globalThis: any;

const ffi = globalThis._senri_ffi;
if (!ffi) throw new FFIError('_senri_ffi not found in global scope');

const adapter = new KossJSAdapter();
setCallbackAdapter(adapter);
setLibraryAdapter(adapter);
setMemoryAdapter(adapter);

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
