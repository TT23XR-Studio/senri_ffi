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

/// <reference types="bun" />

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { join } from 'path';
import { existsSync } from 'fs';
import type * as SenriFFI from '../index';

const platform = process.platform;

function getLibPath(): string {
  if (platform === 'win32') return join(import.meta.dir, '..', '..', '..', '..', 'test-lib', 'target', 'release', 'senri_test.dll');
  if (platform === 'darwin') return join(import.meta.dir, '..', '..', '..', '..', 'test-lib', 'target', 'release', 'libsenri_test.dylib');
  return join(import.meta.dir, '..', '..', '..', '..', 'test-lib', 'target', 'release', 'libsenri_test.so');
}

describe('SenRi FFI Integration (Bun)', () => {
  let senri: typeof SenriFFI;
  let lib: any;

  beforeAll(async () => {
    const mod = await import('../index');
    senri = mod;
    const libPath = getLibPath();
    if (!existsSync(libPath)) throw new Error('Test library not found at ' + libPath);
    console.log('Loading:', libPath);
    lib = senri.Library.load(libPath);
    console.log('Loaded OK');
  });

  afterAll(() => {
    if (lib) lib.close();
  });

  it('add_int', () => {
    const fn = lib.func('add_int', senri.types.int32, [senri.types.int32, senri.types.int32]);
    expect(fn(2, 3)).toBe(5);
  });

  it('multiply_int', () => {
    const fn = lib.func('multiply_int', senri.types.int32, [senri.types.int32, senri.types.int32]);
    expect(fn(6, 7)).toBe(42);
  });

  it('negate_int', () => {
    const fn = lib.func('negate_int', senri.types.int32, [senri.types.int32]);
    expect(fn(42)).toBe(-42);
  });

  it('add_float', () => {
    const fn = lib.func('add_float', senri.types.float64, [senri.types.float64, senri.types.float64]);
    expect(fn(2.5, 3.1)).toBeCloseTo(5.6);
  });

  it('is_positive', () => {
    const fn = lib.func('is_positive', senri.types.int32, [senri.types.int32]);
    expect(fn(5)).toBe(1);
  });

  it.skip('string_length (Bun cstring crash on all platforms)', () => {
    const fn = lib.func('string_length', senri.types.int32, [senri.types.cstring]);
    expect(fn('hello')).toBe(5);
  });

  it.skip('string_equals (Bun cstring crash on all platforms)', () => {
    const fn = lib.func('string_equals', senri.types.int32, [senri.types.cstring, senri.types.cstring]);
    expect(fn('abc', 'abc')).toBe(1);
    expect(fn('abc', 'xyz')).toBe(0);
  });

  it('test_bigint_ops', () => {
    const fn = lib.func('test_bigint_ops', senri.types.int64, [senri.types.int64, senri.types.int64]);
    const result = fn(1000000000000n, 2000000000000n);
    const val = typeof result === 'bigint' ? result : BigInt(result);
    expect(val).toBe(3000000000000n);
  });

  it('funcAsync basic', async () => {
    const addAsync = lib.funcAsync('add_int', senri.types.int32, [senri.types.int32, senri.types.int32]);
    const result = await addAsync(2, 3);
    expect(result).toBe(5);
  });

  it.skip('funcAsync string (Bun cstring crash on all platforms)', async () => {
    const strlenAsync = lib.funcAsync('string_length', senri.types.int32, [senri.types.cstring]);
    const result = await strlenAsync('hello');
    expect(result).toBe(5);
  });
});
