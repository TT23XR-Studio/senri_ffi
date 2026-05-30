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

const typeCache = new WeakMap<object, any>();

export function normalizeType(type: any, adapter: any): any {
  if (isPrimitiveType(type)) {
    return adapter.mapType(type);
  }

  let internal = typeCache.get(type);
  if (internal) return internal;

  if (isStructType(type)) {
    const fields = type.fields;
    const normalizedFields: Record<string, any> = {};
    for (const [name, ft] of Object.entries(fields)) {
      normalizedFields[name] = normalizeType(ft, adapter);
    }
    internal = adapter.createStructType(normalizedFields, type.packed, type.size, type.align);
  } else if (isPointerType(type)) {
    const inner = normalizeType(type.innerType, adapter);
    internal = adapter.createPointerType(inner);
  } else if (isArrayType(type)) {
    const inner = normalizeType(type.innerType, adapter);
    internal = adapter.createArrayType(inner, type.length);
  } else {
    throw new Error('Unknown type descriptor: ' + JSON.stringify(type));
  }

  typeCache.set(type, internal);
  return internal;
}
