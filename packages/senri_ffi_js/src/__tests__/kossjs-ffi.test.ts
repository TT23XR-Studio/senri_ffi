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
 * KossJS FFI Integration Test (vitest + senri_ffi)
 * Run: pnpm test:kossjs
 *
 */

/// <reference types="node" />

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { KossJS } from './kossjs_interface';
import { existsSync } from 'fs';
import { platform } from 'os';


function findLibrary(): string {
  let candidates: string[] = [];
  if (platform() === 'win32') {
    candidates = [
      join(process.cwd(), '..', '..', 'test-lib', 'target', 'release', 'senri_test.dll'),
    ];
  } else if (platform() === 'darwin') {
    candidates = [
      join(process.cwd(), '..', '..', 'test-lib', 'target', 'release', 'libsenri_test.dylib'),
    ];
  } else {
    candidates = [
      join(process.cwd(), '..', '..', 'test-lib', 'target', 'release', 'libsenri_test.so'),
    ];
  }
  console.log('Searching for kossjs library in:', candidates);

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error('kossjs library not found');
}

const TEST_LIB = findLibrary();
const ESCAPED_TEST_LIB = TEST_LIB.replace(/\\/g, '\\\\');

describe('SenRi FFI + KossJS Test', () => {
  let koss: KossJS;

  beforeAll(() => {
    koss = new KossJS();
    console.log('KossJS version:', koss.version());

    // 1. Inject bundled senri_ffi into KossJS runtime
    const bundlePath = join(__dirname, '../../dist/kossjs-bundle.js');
    const bundleCode = readFileSync(bundlePath, 'utf-8');
    koss.eval(bundleCode);
    // After bundle eval, SenRiFFI is available as a global

    // 2. Bind all test functions through senri_ffi's Library API
    koss.eval(`
      var s = globalThis.SenRiFFI;
      console.log('Lib' + '${ESCAPED_TEST_LIB}' + ' loaded with SenRiFFI');
      var lib = s.Library.load('${ESCAPED_TEST_LIB}');
      globalThis._lib = lib;
      globalThis._add_int = lib.func('add_int', s.types.int32, [s.types.int32, s.types.int32]);
      globalThis._mul_int = lib.func('multiply_int', s.types.int32, [s.types.int32, s.types.int32]);
      globalThis._strlen = lib.func('string_length', s.types.int32, [s.types.cstring]);
      globalThis._add_flt = lib.func('add_float', s.types.float64, [s.types.float64, s.types.float64]);
      globalThis._fill = lib.func('fill_buffer', s.types.void, [s.types.pointer, s.types.int32, s.types.uint8]);
      globalThis._read = lib.func('read_byte_at', s.types.uint8, [s.types.pointer, s.types.int32]);
      globalThis._inc = lib.func('increment_point', s.types.void, [s.types.pointer]);
      globalThis._add_async = lib.funcAsync('add_int', s.types.int32, [s.types.int32, s.types.int32]);
    `);
  });

  afterAll(() => {
    if (koss) koss.destroy();
  });

  describe('FFI Existence', () => {
    it('SenRiFFI loaded', () => {
      expect(koss.eval('typeof globalThis.SenRiFFI')).toBe('object');
    });

    it('types.int32 correct', () => {
      expect(koss.eval('globalThis.SenRiFFI.types.int32')).toBe('int32');
    });
  });

  describe('Sync FFI', () => {
    it('add_int(2,3) = 5', () => {
      expect(+koss.eval('_add_int(2,3)')).toBe(5);
    });

    it('multiply_int(6,7) = 42', () => {
      expect(+koss.eval('_mul_int(6,7)')).toBe(42);
    });

    it('string_length(hello) = 5', () => {
      expect(+koss.eval('_strlen("hello")')).toBe(5);
    });

    it('add_float(2.5,3.1) = 5.6', () => {
      expect(+koss.eval('_add_flt(2.5,3.1)')).toBeCloseTo(5.6);
    });

    it('pointer fill/read', () => {
      const r = koss.eval(`
        var f = globalThis._senri_ffi;
        var buf = f.alloc(64);
        globalThis._fill(buf, 64, 0xAB);
        var v = globalThis._read(buf, 0);
        f.free(buf);
        v;
      `);
      expect(+r).toBe(0xAB);
    });

    it('struct increment', () => {
      const r = koss.eval(`
        var f = globalThis._senri_ffi;
        var Point = f.struct([
          { name: 'x', type: f.types.int32 },
          { name: 'y', type: f.types.int32 },
        ]);
        var p = Point({ x: 10, y: 20 });
        globalThis._inc(p.toPointer().address);
        'struct: x=' + p.x + ' y=' + p.y;
      `);
      expect(r).toBe('struct: x=11 y=21');
    });
  });

  describe('Async FFI', () => {
    it('funcAsync binding', () => {
      expect(koss.eval('typeof globalThis._add_async')).toBe('function');
    });

    it('funcAsync call', () => {
      koss.eval('_add_async(2,3); "called"');
    });
  });
});
