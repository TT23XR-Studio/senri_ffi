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

/// <reference types="node" />

import { describe, it, expect } from 'vitest';
import { normalizeType, serializeType, PrimitiveName } from '../types/normalized';
import { TYPES } from '../types/constants';

describe('normalizeType', () => {
  it('normalizes primitive string types', () => {
    expect(normalizeType(TYPES.int32)).toEqual({ kind: 'primitive', name: 'int32' as PrimitiveName });
    expect(normalizeType(TYPES.float64)).toEqual({ kind: 'primitive', name: 'float64' as PrimitiveName });
    expect(normalizeType(TYPES.cstring)).toEqual({ kind: 'primitive', name: 'cstring' as PrimitiveName });
    expect(normalizeType(TYPES.pointer)).toEqual({ kind: 'primitive', name: 'pointer' as PrimitiveName });
    expect(normalizeType(TYPES.void)).toEqual({ kind: 'primitive', name: 'void' as PrimitiveName });
  });

  it('normalizes pointer descriptors', () => {
    const ptr = { __senri_type: 'pointer', innerType: TYPES.int32 };
    const n = normalizeType(ptr);
    expect(n.kind).toBe('pointer');
    expect((n as any).of).toEqual({ kind: 'primitive', name: 'int32' });
  });

  it('normalizes nested pointer descriptors', () => {
    const ptr = { __senri_type: 'pointer', innerType: { __senri_type: 'pointer', innerType: TYPES.uint8 } };
    const n = normalizeType(ptr);
    expect(n.kind).toBe('pointer');
    expect((n as any).of.kind).toBe('pointer');
    expect((n as any).of.of).toEqual({ kind: 'primitive', name: 'uint8' });
  });

  it('normalizes array descriptors', () => {
    const arr = { __senri_type: 'array', innerType: TYPES.float64, length: 10 };
    const n = normalizeType(arr);
    expect(n.kind).toBe('array');
    expect((n as any).length).toBe(10);
    expect((n as any).of).toEqual({ kind: 'primitive', name: 'float64' });
  });

  it('normalizes struct descriptors', () => {
    const st = {
      __senri_type: 'struct',
      fields: { x: TYPES.int32, y: TYPES.float64 },
    };
    const n = normalizeType(st);
    expect(n.kind).toBe('struct');
    expect((n as any).size).toBe(16);
    expect((n as any).align).toBe(8);
    const fields = (n as any).fields;
    expect(fields.x).toEqual({ kind: 'primitive', name: 'int32' });
    expect(fields.y).toEqual({ kind: 'primitive', name: 'float64' });
  });

  it('throws on unknown type descriptors', () => {
    expect(() => normalizeType({ __senri_type: 'unknown' })).toThrow('Unknown type descriptor');
    expect(() => normalizeType({})).toThrow('Unknown type descriptor');
    expect(() => normalizeType(42 as any)).toThrow('Unknown type descriptor');
  });
});

describe('serializeType', () => {
  it('serializes primitives', () => {
    expect(serializeType({ kind: 'primitive', name: 'int32' })).toBe('p:int32');
    expect(serializeType({ kind: 'primitive', name: 'cstring' })).toBe('p:cstring');
  });

  it('serializes pointers', () => {
    expect(serializeType({ kind: 'pointer', of: { kind: 'primitive', name: 'float64' } })).toBe('*p:float64');
  });

  it('serializes arrays', () => {
    expect(serializeType({ kind: 'array', of: { kind: 'primitive', name: 'uint8' }, length: 256 })).toBe('[256]p:uint8');
  });

  it('serializes structs', () => {
    const fields = {
      x: { kind: 'primitive' as const, name: 'int32' as PrimitiveName },
      y: { kind: 'primitive' as const, name: 'float64' as PrimitiveName },
    };
    const st = { kind: 'struct' as const, fields, packed: undefined, size: 16, align: 8 };
    const s = serializeType(st);
    expect(s).toContain('x=p:int32');
    expect(s).toContain('y=p:float64');
    expect(s).toContain('{');
    expect(s).not.toContain('#');
  });

  it('serializes structs', () => {
    const fields = {
      a: { kind: 'primitive' as const, name: 'int32' as PrimitiveName } as const,
    };
    const st = { kind: 'struct' as const, fields, packed: 1, size: 4, align: 4 } as const;
    expect(serializeType(st)).toBe('{#a=p:int32}');
  });

  it('different signatures produce different strings', () => {
    const a = serializeType({ kind: 'primitive', name: 'int32' });
    const b = serializeType({ kind: 'primitive', name: 'float64' });
    expect(a).not.toBe(b);
  });
});
