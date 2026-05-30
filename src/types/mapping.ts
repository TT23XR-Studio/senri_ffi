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

import { TYPES } from './constants';

export const KOSSJS_MAP: Record<string, string> = {
  [TYPES.void]:    'void',
  [TYPES.int8]:    'int8',
  [TYPES.uint8]:   'uint8',
  [TYPES.int16]:   'int16',
  [TYPES.uint16]:  'uint16',
  [TYPES.int32]:   'int32',
  [TYPES.uint32]:  'uint32',
  [TYPES.int64]:   'int64',
  [TYPES.uint64]:  'uint64',
  [TYPES.float32]: 'float32',
  [TYPES.float64]: 'float64',
  [TYPES.pointer]: 'pointer',
  [TYPES.cstring]: 'cstring',
};

export const BUN_MAP: Record<string, string> = {
  [TYPES.void]:    'void',
  [TYPES.int8]:    'i8',
  [TYPES.uint8]:   'u8',
  [TYPES.int16]:   'i16',
  [TYPES.uint16]:  'u16',
  [TYPES.int32]:   'i32',
  [TYPES.uint32]:  'u32',
  [TYPES.int64]:   'i64',
  [TYPES.uint64]:  'u64',
  [TYPES.float32]: 'f32',
  [TYPES.float64]: 'f64',
  [TYPES.pointer]: 'ptr',
  [TYPES.cstring]: 'cstring',
};

let _koffi: any = null;
export function getKoffi(): any {
  if (!_koffi) {
    _koffi = require('koffi');
  }
  return _koffi;
}

let _koffiMap: Record<string, any> | null = null;
export function getKoffiMap(): Record<string, any> {
  if (!_koffiMap) {
    const koffi = getKoffi();
    _koffiMap = {
      [TYPES.void]:    koffi.void,
      [TYPES.int8]:    koffi.int8,
      [TYPES.uint8]:   koffi.uint8,
      [TYPES.int16]:   koffi.int16,
      [TYPES.uint16]:  koffi.uint16,
      [TYPES.int32]:   koffi.int32,
      [TYPES.uint32]:  koffi.uint32,
      [TYPES.int64]:   koffi.int64,
      [TYPES.uint64]:  koffi.uint64,
      [TYPES.float32]: koffi.float,
      [TYPES.float64]: koffi.double,
      [TYPES.pointer]: koffi.pointer,
      [TYPES.cstring]: koffi.string,
    };
  }
  return _koffiMap;
}
