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

/// <reference types="deno" />

import { Library, types, alloc, free } from '../index.ts';

let libname = '';
if (Deno.build.os === 'windows') {
  libname = 'senri_test.dll';
} else if (Deno.build.os === 'darwin') {
  libname = 'libsenri_test.dylib';
} else {
  libname = 'libsenri_test.so';
}
const dllUrl = new URL(`../../test-lib/target/release/${libname}`, import.meta.url);
let DLL = dllUrl.pathname;
if (Deno.build.os === 'windows' && DLL.startsWith('/')) {
  DLL = DLL.slice(1);
}

function eq(actual: unknown, expected: unknown, msg?: string) {
  if (actual !== expected) throw new Error(msg ?? `Expected ${expected}, got ${actual}`);
}

Deno.test('add_int - sync', () => {
  const lib = Library.load(DLL);
  const fn = lib.func('add_int', types.int32, [types.int32, types.int32]);
  eq(fn(2, 3), 5);
  eq(fn(-10, 7), -3);
  eq(fn(0, 0), 0);
  lib.close();
});

Deno.test('multiply_int - sync', () => {
  const lib = Library.load(DLL);
  const fn = lib.func('multiply_int', types.int32, [types.int32, types.int32]);
  eq(fn(6, 7), 42);
  eq(fn(-3, 5), -15);
  lib.close();
});

Deno.test('string_length - sync', () => {
  const lib = Library.load(DLL);
  const fn = lib.func('string_length', types.int32, [types.cstring]);
  eq(fn('hello'), 5);
  eq(fn(''), 0);
  eq(fn('abcdefghij'), 10);
  lib.close();
});

Deno.test('add_float - sync', () => {
  const lib = Library.load(DLL);
  const fn = lib.func('add_float', types.float64, [types.float64, types.float64]);
  const result = fn(2.5, 3.1);
  if (Math.abs(result - 5.6) >= 0.001) throw new Error(`Expected ~5.6, got ${result}`);
  lib.close();
});

Deno.test('pointer operations', () => {
  const lib = Library.load(DLL);
  const fill = lib.func('fill_buffer', types.void, [types.pointer, types.int32, types.uint8]);
  const read = lib.func('read_byte_at', types.uint8, [types.pointer, types.int32]);

  const buf = alloc(64);
  fill(buf, 64, 0xAB);
  eq(read(buf, 0), 0xAB);
  eq(read(buf, 10), 0xAB);
  eq(read(buf, 63), 0xAB);
  free(buf);
  lib.close();
});

Deno.test('increment_point via struct pointer', () => {
  const lib = Library.load(DLL);
  const increment = lib.func('increment_point', types.void, [types.pointer]);

  const buf = alloc(8);
  const view = new DataView(buf._data.__buf);
  view.setInt32(0, 10, true);
  view.setInt32(4, 20, true);
  increment(buf);
  eq(view.getInt32(0, true), 11);
  eq(view.getInt32(4, true), 21);
  free(buf);
  lib.close();
});
