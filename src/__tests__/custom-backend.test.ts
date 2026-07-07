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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isLibraryLike, getMissingMethods, createBackendWithFallback, LibraryLike } from '../types/library-like';
import { getResourceRegistry, ResourceRegistry } from '../resource-registry';
import { getGlobalAdapter, getGlobalAdapterVersion, setGlobalAdapter, isAdapterInitialized } from '../globals';
import { CustomAdapterWrapper } from '../adapters/custom-adapter-wrapper';
import { Library } from '../library';
import { Pointer } from '../pointer';
import { FFIError, FFITypeError, FFIBackendError } from '../errors';
import { FFIAdapter } from '../types/adapter';
import { NormalizedType } from '../types/normalized';
import { alloc, free } from '../memory';

function makeMockBackend(overrides?: Partial<LibraryLike>): LibraryLike {
  let blockId = 0;
  const blocks = new Map<number, ArrayBuffer>();

  return {
    open(path: string): any { return { __path: path, __handle: Symbol('lib') }; },
    bind(handle: any, name: string, _retType: NormalizedType, _argTypes: NormalizedType[]): Function {
      const fn = (...args: any[]) => {
        if (name === 'add') return (args[0] as number) + (args[1] as number);
        if (name === 'identity') return args[0];
        return 0;
      };
      return fn;
    },
    close(_handle: any): void {},
    alloc(size: number): any {
      const id = ++blockId;
      const buf = new ArrayBuffer(size);
      new Uint8Array(buf).fill(0);
      blocks.set(id, buf);
      const ptrValue = BigInt(0x1000 + id);
      return { __ptr: ptrValue, __buf: buf, __size: size };
    },
    free(ptr: any): void {
      for (const [id, buf] of blocks) {
        if (buf === ptr.__buf) { blocks.delete(id); break; }
      }
    },
    addressOf(buffer: ArrayBuffer | ArrayBufferView): bigint {
      return 0x2000n;
    },
    registerCallback(_func: Function, _retType: NormalizedType, _argTypes: NormalizedType[]): any {
      return { __ptr: 0x3000n, __cb: Symbol('cb') };
    },
    unregisterCallback(_ptr: any): void {},
    getErrno(): number { return 0; },
    getStrerror(errno: number): string { return 'error ' + errno; },
    ...overrides,
  };
}

const MOCK_SYSTEM_LIB = makeMockBackend();

describe('isLibraryLike', () => {
  it('returns true for valid backend', () => {
    expect(isLibraryLike(MOCK_SYSTEM_LIB)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isLibraryLike(null)).toBe(false);
  });

  it('returns false for primitive values', () => {
    expect(isLibraryLike(42 as any)).toBe(false);
    expect(isLibraryLike('string' as any)).toBe(false);
  });

  it('returns false if any mandatory method is missing', () => {
    const incomplete = { ...MOCK_SYSTEM_LIB } as any;
    delete incomplete.bind;
    expect(isLibraryLike(incomplete)).toBe(false);
  });

  it('returns false if mandatory method is not a function', () => {
    const broken = { ...MOCK_SYSTEM_LIB, bind: 42 as any };
    expect(isLibraryLike(broken)).toBe(false);
  });
});

describe('getMissingMethods', () => {
  it('returns empty array for valid backend', () => {
    expect(getMissingMethods(MOCK_SYSTEM_LIB)).toEqual([]);
  });

  it('lists missing methods', () => {
    const incomplete = { open() {}, bind() {}, close() {} } as any;
    const missing = getMissingMethods(incomplete);
    expect(missing).toContain('alloc');
    expect(missing).toContain('free');
    expect(missing).toContain('addressOf');
    expect(missing).toContain('registerCallback');
    expect(missing).toContain('unregisterCallback');
    expect(missing).toContain('getErrno');
    expect(missing).toContain('getStrerror');
    expect(missing.length).toBe(7);
  });
});

describe('ResourceRegistry', () => {
  let r: ResourceRegistry;

  beforeEach(() => {
    r = getResourceRegistry();
    r.clear();
  });

  it('starts empty', () => {
    expect(r.hasActiveResources()).toBe(false);
    expect(r.getActiveMemoryCount()).toBe(0);
    expect(r.getActiveCallbackCount()).toBe(0);
  });

  it('tracks memory blocks', () => {
    const block = { __ptr: 1n, __buf: new ArrayBuffer(4), __size: 4 };
    r.registerMemory(block);
    expect(r.hasActiveResources()).toBe(true);
    expect(r.getActiveMemoryCount()).toBe(1);
    r.unregisterMemory(block);
    expect(r.hasActiveResources()).toBe(false);
  });

  it('tracks callbacks', () => {
    const cb = { __ptr: 2n, __cb: Symbol() };
    r.registerCallback(cb);
    expect(r.hasActiveResources()).toBe(true);
    expect(r.getActiveCallbackCount()).toBe(1);
    r.unregisterCallback(cb);
    expect(r.hasActiveResources()).toBe(false);
  });

  it('forEachCallback iterates over callbacks', () => {
    const cb1 = { __ptr: 1n, __cb: Symbol() };
    const cb2 = { __ptr: 2n, __cb: Symbol() };
    r.registerCallback(cb1);
    r.registerCallback(cb2);
    const visited: any[] = [];
    r.forEachCallback(c => visited.push(c));
    expect(visited.length).toBe(2);
  });

  it('clear removes all resources', () => {
    r.registerMemory({ __ptr: 1n, __buf: new ArrayBuffer(1), __size: 1 });
    r.registerCallback({ __ptr: 2n, __cb: Symbol() });
    expect(r.hasActiveResources()).toBe(true);
    r.clear();
    expect(r.hasActiveResources()).toBe(false);
  });
});

describe('CustomAdapterWrapper', () => {
  let wrapper: CustomAdapterWrapper;

  beforeEach(() => {
    wrapper = new CustomAdapterWrapper(makeMockBackend());
  });

  it('implements FFIAdapter', () => {
    expect(wrapper._isCustomBackend).toBe(true);
    expect(typeof wrapper.loadLibrary).toBe('function');
    expect(typeof wrapper.bindFunction).toBe('function');
    expect(typeof wrapper.alloc).toBe('function');
    expect(typeof wrapper.free).toBe('function');
  });

  it('loadLibrary delegates to backend.open', () => {
    const handle = wrapper.loadLibrary('/test/lib.so');
    expect(handle).toBeDefined();
    expect(handle.__path).toBe('/test/lib.so');
  });

  it('bindFunction delegates to backend.bind', () => {
    const handle = wrapper.loadLibrary('/test/lib.so');
    const fn = wrapper.bindFunction(handle, 'add',
      { kind: 'primitive', name: 'int32' },
      [{ kind: 'primitive', name: 'int32' }, { kind: 'primitive', name: 'int32' }],
    );
    expect(fn(3, 4)).toBe(7);
  });

  it('alloc returns correct shape and registers resource', () => {
    const r = getResourceRegistry();
    r.clear();
    const result = wrapper.alloc(16);
    expect(typeof result.__ptr).toBe('bigint');
    expect(result.__buf).toBeDefined();
    expect(result.__size).toBe(16);
    expect(r.getActiveMemoryCount()).toBe(1);
    wrapper.free(result);
    expect(r.getActiveMemoryCount()).toBe(0);
  });

  it('closeLibrary silently catches errors', () => {
    let called = false;
    const bad = makeMockBackend({
      close() { called = true; throw new Error('close failed'); },
    });
    const w = new CustomAdapterWrapper(bad);
    expect(() => w.closeLibrary({})).not.toThrow();
    expect(called).toBe(true);
  });

  it('free silently catches errors', () => {
    let called = false;
    const bad = makeMockBackend({
      free(_ptr: any) { called = true; throw new Error('free failed'); },
    });
    const w = new CustomAdapterWrapper(bad);
    const result = w.alloc(4);
    expect(() => w.free(result)).not.toThrow();
    expect(called).toBe(true);
  });

  it('mapType returns stable serialized string', () => {
    const t1: NormalizedType = { kind: 'primitive', name: 'int32' };
    const t2: NormalizedType = { kind: 'pointer', of: { kind: 'primitive', name: 'uint8' } };
    expect(wrapper.mapType(t1)).toBe('p:int32');
    expect(wrapper.mapType(t2)).toBe('*p:uint8');
  });

  it('registerCallback returns object with _unregister function', () => {
    const result = wrapper.registerCallback(
      () => 42,
      { kind: 'primitive', name: 'int32' },
      [],
    );
    expect(result.__ptr).toBe(0x3000n);
    expect(typeof result._unregister).toBe('function');
  });

  it('getErrno returns default on exception', () => {
    const bad = makeMockBackend({ getErrno() { throw new Error('oops'); } });
    const w = new CustomAdapterWrapper(bad);
    expect(w.getErrno()).toBe(0);
  });

  it('getStrerror returns default on exception', () => {
    const bad = makeMockBackend({ getStrerror(_e: number) { throw new Error('oops'); } });
    const w = new CustomAdapterWrapper(bad);
    expect(w.getStrerror(42)).toBe('Unknown error');
  });

  it('calls init on construction', () => {
    let initCalled = false;
    const backend = makeMockBackend({ init() { initCalled = true; } });
    new CustomAdapterWrapper(backend);
    expect(initCalled).toBe(true);
  });

  it('calls destroy on cleanup', () => {
    let destroyCalled = false;
    const backend = makeMockBackend({ destroy() { destroyCalled = true; } });
    const w = new CustomAdapterWrapper(backend);
    w.cleanup();
    expect(destroyCalled).toBe(true);
  });

  it('init exception is wrapped in FFIError', () => {
    const backend = makeMockBackend({ init() { throw new Error('init boom'); } });
    expect(() => new CustomAdapterWrapper(backend)).toThrow(FFIError);
  });

  it('bindFunction wraps error in FFIError', () => {
    const backend = makeMockBackend({ bind() { throw new Error('symbol not found'); } });
    const w = new CustomAdapterWrapper(backend);
    expect(() => w.bindFunction({}, 'foo',
      { kind: 'primitive', name: 'int32' }, [],
    )).toThrow(FFIError);
  });
});

describe('setGlobalAdapter / getGlobalAdapter', () => {
  beforeEach(() => {
    const r = getResourceRegistry();
    r.clear();
    if (isAdapterInitialized()) {
      setGlobalAdapter(new CustomAdapterWrapper(makeMockBackend()), true);
    }
  });

  it('set and get global adapter', () => {
    const w = new CustomAdapterWrapper(makeMockBackend());
    setGlobalAdapter(w);
    expect(getGlobalAdapter()).toBe(w);
  });

  it('getGlobalAdapterVersion increments on set', () => {
    const v0 = getGlobalAdapterVersion();
    setGlobalAdapter(new CustomAdapterWrapper(makeMockBackend()));
    expect(getGlobalAdapterVersion()).toBe(v0 + 1);
  });

  it('throws on switch with active resources when not forced', () => {
    const w1 = new CustomAdapterWrapper(makeMockBackend());
    setGlobalAdapter(w1);

    const block = w1.alloc(4);
    const r = getResourceRegistry();
    r.registerMemory(block);

    const w2 = new CustomAdapterWrapper(makeMockBackend());
    expect(() => setGlobalAdapter(w2)).toThrow(FFIError);

    r.unregisterMemory(block);
    w1.free(block);
  });

  it('force switch with active resources clears registry', () => {
    const w1 = new CustomAdapterWrapper(makeMockBackend());
    setGlobalAdapter(w1);

    const r = getResourceRegistry();
    const block = w1.alloc(4);
    r.registerMemory(block);

    const w2 = new CustomAdapterWrapper(makeMockBackend());
    setGlobalAdapter(w2, true);
    expect(getGlobalAdapter()).toBe(w2);
    expect(r.hasActiveResources()).toBe(false);
  });
});

describe('createBackendWithFallback', () => {
  class FakeBuiltinAdapter implements FFIAdapter {
    loadLibrary(_path: string): any { return 'builtin_lib'; }
    bindFunction(_lib: any, _name: string, _ret: NormalizedType, _args: NormalizedType[]): Function { return () => 999; }
    closeLibrary(_lib: any): void {}
    alloc(_size: number): any { return { __ptr: 0x5000n, __buf: new ArrayBuffer(4), __size: 4 }; }
    free(_ptr: any): void {}
    addressOf(_buffer: ArrayBuffer | ArrayBufferView): bigint { return 0x6000n; }
    registerCallback(_func: Function, _ret: NormalizedType, _argTypes: NormalizedType[]): any { return { __ptr: 0x7000n, __cb: Symbol() }; }
    unregisterCallback(_ptr: any): void {}
    getErrno(): number { return 99; }
    getStrerror(_errno: number): string { return 'builtin error'; }
    mapType(type: NormalizedType): any { return type.name; }
    createPointerType(_of: NormalizedType): any { return 'ptr'; }
    createArrayType(_of: NormalizedType, _len: number): any { return 'arr'; }
    createStructType(_fields: Record<string, NormalizedType>, _packed?: number, _size?: number, _align?: number): any { return 'struct'; }
  }

  it('uses partial implementation when available', () => {
    const partial: Partial<LibraryLike> = {
      open(_path: string) { return 'custom_lib'; },
      bind(_handle: any, _name: string, _ret: NormalizedType, _args: NormalizedType[]) { return () => 42; },
      close(_handle: any) {},
      alloc(_size: number) { return { __ptr: 0x9000n, __buf: new ArrayBuffer(8), __size: 8 }; },
      free(_ptr: any) {},
      addressOf(_buffer: ArrayBuffer | ArrayBufferView) { return 0x1111n; },
      registerCallback(_func: Function, _ret: NormalizedType, _argTypes: NormalizedType[]) { return { __ptr: 0x2222n, __cb: Symbol() }; },
      unregisterCallback(_ptr: any) {},
      getErrno() { return 42; },
      getStrerror(_errno: number) { return 'custom'; },
    };

    const backend = createBackendWithFallback(partial, new FakeBuiltinAdapter());
    expect(isLibraryLike(backend)).toBe(true);
    expect(backend.open('/test')).toBe('custom_lib');
    expect(backend.getErrno()).toBe(42);
  });

  it('falls back to builtinAdapter for missing methods', () => {
    const partial: Partial<LibraryLike> = {
      open(_path: string) { return 'partial_lib'; },
      bind(_handle: any, _name: string, _ret: NormalizedType, _args: NormalizedType[]) { return () => 1; },
      close(_handle: any) {},
    };

    const backend = createBackendWithFallback(partial, new FakeBuiltinAdapter());
    expect(backend.open('/test')).toBe('partial_lib');
    expect(backend.alloc(4).__ptr).toBe(0x5000n);
    expect(backend.getErrno()).toBe(99);
  });

  it('includes optional methods when provided', () => {
    let asyncCalled = false;
    const partial: Partial<LibraryLike> = {
      open(_path: string) { return 'lib'; },
      bind(_h: any, _n: string, _r: NormalizedType, _a: NormalizedType[]) { return () => 0; },
      close(_h: any) {},
      alloc(_s: number) { return { __ptr: 0n, __buf: new ArrayBuffer(1), __size: 1 }; },
      free(_p: any) {},
      addressOf(_b: ArrayBuffer | ArrayBufferView) { return 0n; },
      registerCallback(_f: Function, _r: NormalizedType, _a: NormalizedType[]) { return { __ptr: 0n, __cb: Symbol() }; },
      unregisterCallback(_p: any) {},
      getErrno() { return 0; },
      getStrerror(_e: number) { return ''; },
      bindAsync(_handle: any, _name: string, _ret: NormalizedType, _argTypes: NormalizedType[]) {
        asyncCalled = true;
        return async () => 42;
      },
    };

    const backend = createBackendWithFallback(partial, new FakeBuiltinAdapter());
    expect(typeof backend.bindAsync).toBe('function');
  });
});

describe('Library.load with custom backend', () => {
  let senri: typeof import('../index');
  let versionBefore: number;

  beforeEach(async () => {
    const r = getResourceRegistry();
    r.clear();
    if (isAdapterInitialized()) {
      setGlobalAdapter(new CustomAdapterWrapper(makeMockBackend()), true);
    }
    senri = await import('../index');
    versionBefore = getGlobalAdapterVersion();
  });

  it('loads library with custom backend object', () => {
    const lib = Library.load('/test/lib.so', makeMockBackend());
    expect(lib).toBeDefined();
    expect(lib.libPath).toBe('/test/lib.so');
    lib.close();
  });

  it('loads library with custom backend constructor', () => {
    class MyBackend {
      open(path: string) { return { __path: path }; }
      bind(_h: any, name: string, _r: NormalizedType, _a: NormalizedType[]) { return () => name.length; }
      close(_h: any) {}
      alloc(size: number) { return { __ptr: 0xAn, __buf: new ArrayBuffer(size), __size: size }; }
      free(_p: any) {}
      addressOf(_b: ArrayBuffer | ArrayBufferView) { return 0xBn; }
      registerCallback(_f: Function, _r: NormalizedType, _a: NormalizedType[]) { return { __ptr: 0xCn, __cb: Symbol() }; }
      unregisterCallback(_p: any) {}
      getErrno() { return 0; }
      getStrerror(_e: number) { return ''; }
    }

    const lib = Library.load('/test/lib.so', MyBackend);
    expect(lib).toBeDefined();
    lib.close();
  });

  it('binds function from custom backend', () => {
    const lib = Library.load('/test/lib.so', makeMockBackend());
    const add = lib.func('add', senri.types.int32, [senri.types.int32, senri.types.int32]);
    expect(add(3, 4)).toBe(7);
    lib.close();
  });

  it('caches function with same signature', () => {
    const lib = Library.load('/test/lib.so', makeMockBackend());
    const a = lib.func('add', senri.types.int32, [senri.types.int32, senri.types.int32]);
    const b = lib.func('add', senri.types.int32, [senri.types.int32, senri.types.int32]);
    expect(a).toBe(b);
    lib.close();
  });

  it('throws on invalid backend (missing methods)', () => {
    expect(() => Library.load('/test/lib.so', {} as any)).toThrow(FFITypeError);
  });

  it('throws on invalid backend type', () => {
    expect(() => Library.load('/test/lib.so', 'not-a-backend' as any)).toThrow(FFITypeError);
    expect(() => Library.load('/test/lib.so', 42 as any)).toThrow(FFITypeError);
  });

  it('funcAsync with backend that has bindAsync', async () => {
    const backend = makeMockBackend({
      bindAsync(_handle: any, name: string, _ret: NormalizedType, _argTypes: NormalizedType[]) {
        return async (..._args: any[]) => name.length;
      },
    });
    const lib = Library.load('/test/lib.so', backend);
    const asyncFn = lib.funcAsync('hello', senri.types.int32, []);
    const result = await asyncFn();
    expect(result).toBe(5);
    lib.close();
  });

  it('funcAsync with backend that has no bindAsync produces sync fallback', async () => {
    const lib = Library.load('/test/lib.so', makeMockBackend());
    const asyncFn = lib.funcAsync('add', senri.types.int32, [senri.types.int32, senri.types.int32]);
    const result = await asyncFn(10, 20);
    expect(result).toBe(30);
    expect((asyncFn as any)._isSyncFallback).toBe(true);
    lib.close();
  });

  it('alloc/free works with custom backend', () => {
    const lib = Library.load('/test/lib.so', makeMockBackend());
    const p = alloc(64);
    expect(typeof p.address).toBe('bigint');
    expect(p.isNull()).toBe(false);
    free(p);
    lib.close();
  });
});

describe('Version stamp check (zombie detection)', () => {
  let senri: typeof import('../index');

  beforeEach(async () => {
    const r = getResourceRegistry();
    r.clear();
    if (isAdapterInitialized()) {
      setGlobalAdapter(new CustomAdapterWrapper(makeMockBackend()), true);
    }
    senri = await import('../index');
  });

  it('prevents calling func after adapter replaced', () => {
    const lib = Library.load('/test/lib.so', makeMockBackend());
    lib.func('add', senri.types.int32, [senri.types.int32, senri.types.int32]);

    setGlobalAdapter(new CustomAdapterWrapper(makeMockBackend()), true);

    expect(() => lib.func('add', senri.types.int32, [senri.types.int32, senri.types.int32])).toThrow(FFIError);
  });

  it('prevents calling funcAsync after adapter replaced', () => {
    const lib = Library.load('/test/lib.so', makeMockBackend());
    const asyncFn = lib.funcAsync('add', senri.types.int32, [senri.types.int32, senri.types.int32]);

    setGlobalAdapter(new CustomAdapterWrapper(makeMockBackend()), true);

    expect(() => lib.funcAsync('add', senri.types.int32, [senri.types.int32, senri.types.int32])).toThrow(FFIError);
  });
});
