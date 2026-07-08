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
import { Pointer } from '../pointer';

describe('Pointer', () => {
  describe('constructor', () => {
    it('creates from bigint', () => {
      const p = new Pointer(0x1000n);
      expect(p.address).toBe(0x1000n);
      expect(p.isNull()).toBe(false);
    });

    it('creates from number', () => {
      const p = new Pointer(0x1000);
      expect(p.address).toBe(0x1000n);
    });

    it('creates null pointer', () => {
      const p = new Pointer();
      expect(p.isNull()).toBe(true);
    });

    it('creates from ArrayBuffer', () => {
      const buf = new ArrayBuffer(16);
      const p = new Pointer(buf);
      expect(p.isNull()).toBe(true);
    });
  });

  describe('address / isNull', () => {
    it('address returns bigint', () => {
      const p = new Pointer(0xDeadBeefn);
      expect(typeof p.address).toBe('bigint');
      expect(p.address).toBe(0xDeadBeefn);
    });

    it('isNull for zero address', () => {
      expect(new Pointer(0n).isNull()).toBe(true);
      expect(new Pointer(0).isNull()).toBe(true);
      expect(new Pointer().isNull()).toBe(true);
    });

    it('isNull false for non-zero', () => {
      expect(new Pointer(1n).isNull()).toBe(false);
    });
  });

  describe('numberAddress', () => {
    it('converts small bigint to number', () => {
      const p = new Pointer(0x1000n);
      expect(p.numberAddress).toBe(0x1000);
    });

    it('throws for large addresses', () => {
      const tooLarge = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
      const p = new Pointer(tooLarge);
      expect(() => p.numberAddress).toThrow('safe integer');
    });
  });

  describe('add', () => {
    it('adds offset to address', () => {
      const p = new Pointer(0x1000n);
      const q = p.add(0x20);
      expect(q.address).toBe(0x1020n);
    });
  });

  describe('toBigInt', () => {
    it('converts to bigint', () => {
      expect(new Pointer(0xFFFFn).toBigInt()).toBe(0xFFFFn);
    });
  });

  describe('read/write on ArrayBuffer-backed pointer', () => {
    it('reads and writes int32', () => {
      const buf = new ArrayBuffer(8);
      const p = new Pointer(buf);
      p.writeInt32(0, 42);
      expect(p.readInt32(0)).toBe(42);
    });

    it('reads and writes float64', () => {
      const buf = new ArrayBuffer(8);
      const p = new Pointer(buf);
      p.writeFloat64(0, 3.14159);
      expect(p.readFloat64(0)).toBeCloseTo(3.14159);
    });

    it('writes and reads C string', () => {
      const buf = new ArrayBuffer(32);
      const p = new Pointer(buf);
      p.writeCString(0, 'hello');
      expect(p.readCString(0)).toBe('hello');
    });
  });

  describe('readPointer / writePointer', () => {
    it('writes and reads pointer values', () => {
      const buf = new ArrayBuffer(8);
      const p = new Pointer(buf);
      p.writePointer(0, 0xDeadBeefn);
      expect(p.readPointer(0).address).toBe(0xDeadBeefn);
    });
  });
});
