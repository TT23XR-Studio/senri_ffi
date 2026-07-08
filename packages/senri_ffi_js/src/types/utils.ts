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

export interface TypeDescriptor {
  __senri_type?: string;
  fields?: Record<string, any>;
  packed?: number;
  size?: number;
  align?: number;
  sizeof?: number;
  innerType?: any;
  length?: number;
  constructor?: any;
}

export interface FieldInfo {
  name: string;
  offset: number;
  type: any;
  size: number;
}

export function isPrimitiveType(t: any): boolean {
  return typeof t === 'string' && t in TYPES;
}

export function isStructType(t: any): boolean {
  return t && t.__senri_type === 'struct';
}

export function isPointerType(t: any): boolean {
  return t && t.__senri_type === 'pointer';
}

export function isArrayType(t: any): boolean {
  return t && t.__senri_type === 'array';
}

export function getTypeSize(t: any): number {
  if (typeof t === 'string') return TYPE_SIZES[t] || 0;
  if (t && t.sizeof !== undefined) return t.sizeof;
  return 0;
}

export function getTypeAlign(t: any): number {
  if (typeof t === 'string') return TYPE_ALIGNS[t] || 1;
  if (t && t.align !== undefined) return t.align;
  return 1;
}

export function computeLayout(
  fields: Record<string, any>,
  packed?: number
): { fieldInfos: FieldInfo[]; totalSize: number; maxAlign: number } {
  let offset = 0;
  let maxAlign = 1;
  const fieldInfos: FieldInfo[] = [];

  for (const [name, type] of Object.entries(fields)) {
    const align = packed ? Math.min(getTypeAlign(type), packed) : getTypeAlign(type);
    if (!packed && offset % align !== 0) {
      offset = Math.ceil(offset / align) * align;
    }
    const size = getTypeSize(type);
    fieldInfos.push({ name, offset, type, size });
    offset += size;
    maxAlign = Math.max(maxAlign, align);
  }

  const totalSize = packed ? offset : Math.ceil(offset / maxAlign) * maxAlign;
  return { fieldInfos, totalSize, maxAlign };
}
