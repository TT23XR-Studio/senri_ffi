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

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type * as SenriFFI from '../index';

const isNode = typeof process !== 'undefined' && process.versions?.node;
const hasKoffi = (() => {
  try { require('koffi'); return true; } catch { return false; }
})();

describe.runIf(isNode && hasKoffi)('Node.js FFI Integration', () => {
  let senri: typeof SenriFFI;
  let lib: any;

  beforeAll(async () => {
    senri = await import('../index');
    const platform = process.platform;
    let libPath: string;

    if (platform === 'win32') {
      libPath = 'msvcrt';
    } else if (platform === 'darwin') {
      libPath = 'libSystem.B.dylib';
    } else {
      libPath = 'libc.so.6';
    }

    lib = senri.Library.load(libPath);
  });

  afterAll(() => {
    if (lib) lib.close();
  });

  it('loads a system library', () => {
    expect(lib).toBeDefined();
  });

  it('calls a simple C function (abs)', () => {
    const abs = lib.func('abs', senri.types.int32, [senri.types.int32]);
    expect(abs(-42)).toBe(42);
    expect(abs(99)).toBe(99);
  });

  it('calls strlen', () => {
    const strlen = lib.func('strlen', senri.types.int32, [senri.types.cstring]);
    expect(strlen('hello')).toBe(5);
    expect(strlen('')).toBe(0);
  });

  it('binds multiple functions independently', () => {
    const abs = lib.func('abs', senri.types.int32, [senri.types.int32]);
    const strlen = lib.func('strlen', senri.types.int32, [senri.types.cstring]);
    expect(abs(100)).toBe(100);
    expect(strlen('test')).toBe(4);
  });

  it('caches functions with same signature', () => {
    const a = lib.func('abs', senri.types.int32, [senri.types.int32]);
    const b = lib.func('abs', senri.types.int32, [senri.types.int32]);
    expect(a).toBe(b);
  });

  it('uses different cache keys for different signatures', () => {
    const a = lib.func('abs', senri.types.int32, [senri.types.int32]);
    const b = lib.func('abs', senri.types.float64, [senri.types.float64]);
    expect(a).not.toBe(b);
  });

  it('allocates and frees memory', () => {
    const ptr = senri.alloc(64);
    expect(ptr).toBeDefined();
    expect(typeof ptr.address).toBe('bigint');
    senri.free(ptr);
  });

  it('gets address of ArrayBuffer', () => {
    const buf = new ArrayBuffer(32);
    const ptr = senri.addressOf(buf);
    expect(typeof ptr.address).toBe('bigint');
  });

  it('creates and uses struct', () => {
    const Point = senri.struct({ x: senri.types.int32, y: senri.types.int32 });
    expect(Point.sizeof).toBe(8);
    expect(Point.align).toBe(4);

    const p = new Point({ x: 10, y: 20 });
    expect(p.x).toBe(10);
    expect(p.y).toBe(20);
  });

  describe('funcAsync (Node.js emulated)', () => {
    it('returns a function that returns Promise', async () => {
      const absAsync = lib.funcAsync('abs', senri.types.int32, [senri.types.int32]);
      const result = await absAsync(-42);
      expect(result).toBe(42);
    });

    it('calls strlen via funcAsync', async () => {
      const strlenAsync = lib.funcAsync('strlen', senri.types.int32, [senri.types.cstring]);
      const result = await strlenAsync('hello');
      expect(result).toBe(5);
    });
  });
});

describe('Node.js skip reason', () => {
  it.runIf(!isNode || !hasKoffi)('skipped due to missing runtime or koffi', () => {
    expect(true).toBe(true);
  });
});
