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

import { TYPES, TYPE_SIZES, TYPE_ALIGNS } from './constants';
import { FFITypeError } from '../errors';

export type PrimitiveName =
  | 'void'
  | 'int8' | 'uint8'
  | 'int16' | 'uint16'
  | 'int32' | 'uint32'
  | 'int64' | 'uint64'
  | 'float32' | 'float64'
  | 'cstring'
  | 'pointer';

export type NormalizedType =
  | { kind: 'primitive'; name: PrimitiveName }
  | { kind: 'pointer'; of: NormalizedType }
  | { kind: 'array'; of: NormalizedType; length: number }
  | { kind: 'struct'; fields: Record<string, NormalizedType>; packed?: number; size: number; align: number };

export function getNormalizedSize(type: NormalizedType): number {
  switch (type.kind) {
    case 'primitive': return TYPE_SIZES[type.name];
    case 'pointer':   return TYPE_SIZES.pointer;
    case 'array':     return getNormalizedSize(type.of) * type.length;
    case 'struct':    return type.size;
  }
}

export function getNormalizedAlign(type: NormalizedType): number {
  switch (type.kind) {
    case 'primitive': return TYPE_ALIGNS[type.name];
    case 'pointer':   return TYPE_ALIGNS.pointer;
    case 'array':     return getNormalizedAlign(type.of);
    case 'struct':    return type.align;
  }
}

function isTypeDescriptor(t: any): boolean {
  return t && typeof t === 'object' && typeof t.__senri_type === 'string';
}

function normalizeFields(fields: Record<string, any>): Record<string, NormalizedType> {
  const result: Record<string, NormalizedType> = {};
  for (const [name, ft] of Object.entries(fields)) {
    result[name] = normalizeType(ft);
  }
  return result;
}

function isPrimitiveString(t: any): t is string {
  return typeof t === 'string' && t in TYPES;
}

export function normalizeType(type: any): NormalizedType {
  if (isPrimitiveString(type)) {
    return { kind: 'primitive', name: type as PrimitiveName };
  }

  if (!isTypeDescriptor(type)) {
    throw new FFITypeError('Unknown type descriptor: ' + JSON.stringify(type));
  }

  const tt = type.__senri_type;

  if (tt === 'pointer') {
    return {
      kind: 'pointer',
      of: normalizeType(type.innerType || TYPES.pointer),
    };
  }

  if (tt === 'array') {
    return {
      kind: 'array',
      of: normalizeType(type.innerType),
      length: type.length || 0,
    };
  }

  if (tt === 'struct') {
    const fields = normalizeFields(type.fields);
    const fieldEntries: Record<string, any> = {};
    for (const [name, nt] of Object.entries(fields)) {
      fieldEntries[name] = nt;
    }
    const totalSize = computeNormalizedLayout(fieldEntries, type.packed);
    let maxAlign = 1;
    for (const nt of Object.values(fields)) {
      maxAlign = Math.max(maxAlign, getNormalizedAlign(nt));
    }
    return {
      kind: 'struct',
      fields,
      packed: type.packed,
      size: totalSize,
      align: maxAlign,
    };
  }

  throw new FFITypeError('Unknown type descriptor: ' + JSON.stringify(type));
}

function computeNormalizedLayout(
  fields: Record<string, NormalizedType>,
  packed?: number
): number {
  let offset = 0;
  let maxAlign = 1;

  for (const nt of Object.values(fields)) {
    const align = packed ? Math.min(getNormalizedAlign(nt), packed) : getNormalizedAlign(nt);
    if (!packed && offset % align !== 0) {
      offset = Math.ceil(offset / align) * align;
    }
    offset += getNormalizedSize(nt);
    maxAlign = Math.max(maxAlign, align);
  }

  return packed ? offset : Math.ceil(offset / maxAlign) * maxAlign;
}

export function serializeType(type: NormalizedType): string {
  switch (type.kind) {
    case 'primitive': return 'p:' + type.name;
    case 'pointer':   return '*' + serializeType(type.of);
    case 'array':     return '[' + type.length + ']' + serializeType(type.of);
    case 'struct': {
      const fields = Object.entries(type.fields)
        .map(([k, v]) => k + '=' + serializeType(v))
        .sort()
        .join(',');
      return '{' + (type.packed ? '#' : '') + fields + '}';
    }
  }
}
