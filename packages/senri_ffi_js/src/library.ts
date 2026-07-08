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

import { FFIError, FFITypeError } from './errors';
import { FFIAdapter } from './types/adapter';
import { NormalizedType, normalizeType, serializeType } from './types/normalized';
import { LibraryLike, isLibraryLike, getMissingMethods } from './types/library-like';
import { CustomAdapterWrapper } from './adapters/custom-adapter-wrapper';
import { getGlobalAdapter, getGlobalAdapterVersion, setGlobalAdapter, isAdapterInitialized } from './globals';
import { getResourceRegistry } from './resource-registry';
import { AsyncChannel } from './async/channel';

let _globalWarnedAsync: boolean = false;

const MAX_CACHE_SIZE = 500;

declare var globalThis: any;
declare var process: any;

function hasCallbackParam(_args: any[]): boolean {
  return _args.some(a => typeof a === 'function');
}

function isDenoRuntime(): boolean {
  return typeof (globalThis).Deno !== 'undefined' && !!(globalThis).Deno.dlopen;
}

function isBunRuntime(): boolean {
  return typeof (globalThis).Bun !== 'undefined' && !!(globalThis).Bun?.FFI;
}

function isKossJSRuntime(): boolean {
  return typeof (globalThis)._senri_ffi !== 'undefined' && !!(globalThis)._senri_ffi;
}

function performSmokeTest(instance: LibraryLike): void {
  const skip = typeof process !== 'undefined' && process.env?.SENRI_FFI_SKIP_SMOKE_TEST === '1';
  if (skip) return;

  try {
    const mem = instance.alloc(1);
    if (typeof mem.__ptr !== 'bigint') {
      throw new FFITypeError('alloc(1) returned object with invalid __ptr: expected bigint, got ' + typeof mem.__ptr);
    }
    if (!mem.__buf) {
      throw new FFITypeError('alloc(1) returned object with missing or falsy __buf');
    }
    if (typeof mem.__size !== 'number') {
      throw new FFITypeError('alloc(1) returned object with invalid __size: expected number, got ' + typeof mem.__size);
    }
    instance.free(mem);

    const errno = instance.getErrno();
    if (typeof errno !== 'number') {
      throw new FFITypeError('getErrno() returned invalid type: expected number, got ' + typeof errno);
    }
  } catch (e: any) {
    if (e instanceof FFITypeError) throw e;
    throw new FFITypeError('Smoke test failed: ' + e.message);
  }
}

function resolveBackend(backend: any, path: string): LibraryLike {
  if (typeof backend === 'function') {
    const instance = new backend(path);
    return instance;
  }
  if (backend && typeof backend === 'object') {
    return backend;
  }
  throw new FFITypeError('Invalid backend: expected a LibraryLike object or a constructor, got ' + typeof backend);
}

export class Library {
  private _handle: any;
  private _libPath: string;
  private _closed: boolean;
  private _funcCache: Map<string, Function>;
  private _asyncCache: Map<string, any>;
  private _workerChannel: AsyncChannel | null = null;
  private _adapter: FFIAdapter;
  private _adapterVersion: number;

  private constructor(handle: any, path: string, adapter: FFIAdapter, version: number) {
    this._handle = handle;
    this._libPath = path;
    this._closed = false;
    this._funcCache = new Map();
    this._asyncCache = new Map();
    this._adapter = adapter;
    this._adapterVersion = version;
  }

  private _checkAlive(): void {
    if (this._closed) throw new FFIError('Library is closed');
    if (getGlobalAdapterVersion() !== this._adapterVersion) {
      throw new FFIError(
        'Library instance has expired: the global FFI backend has been replaced. ' +
        'Please reload the library via Library.load().'
      );
    }
  }

  private _setCache(map: Map<string, any>, key: string, value: any): void {
    if (map.size >= MAX_CACHE_SIZE) {
      const oldest = map.keys().next().value;
      if (oldest !== undefined) map.delete(oldest);
    }
    map.set(key, value);
  }

  static load(path: string, backend?: LibraryLike | { new (path: string): LibraryLike }): Library {
    let adapter: FFIAdapter;

    if (backend === undefined || backend === null) {
      if (!isAdapterInitialized()) {
        throw new FFIError('Adapter not initialized');
      }
      adapter = getGlobalAdapter();
    } else {
      const instance = resolveBackend(backend, path);

      if (!isLibraryLike(instance)) {
        const missing = getMissingMethods(instance);
        throw new FFITypeError('Invalid backend: missing mandatory methods: ' + missing.join(', '));
      }

      performSmokeTest(instance);

      const wrapper = new CustomAdapterWrapper(instance);
      adapter = wrapper;
    }

    if (adapter !== getGlobalAdapter() && isAdapterInitialized()) {
      const oldAdapter = getGlobalAdapter();
      if ((oldAdapter as any)._isCustomBackend) {
        (oldAdapter as CustomAdapterWrapper).cleanup();
      }
      const registry = getResourceRegistry();
      registry.forEachCallback((cb: any) => {
        if (typeof cb._unregister === 'function') {
          try { cb._unregister(); } catch {}
        }
      });
    }

    setGlobalAdapter(adapter);

    const handle = adapter.loadLibrary(path);
    return new Library(handle, path, adapter, getGlobalAdapterVersion());
  }

  func(name: string, retType: any, argTypes: any[], options?: any): Function {
    this._checkAlive();

    const normalizedRet = normalizeType(retType);
    const normalizedArgs = argTypes.map(t => normalizeType(t));

    const cacheKey = name + '|' + serializeType(normalizedRet) + '|' + normalizedArgs.map(a => serializeType(a)).join(',');
    const cached = this._funcCache.get(cacheKey);
    if (cached) return cached;

    const bound = this._adapter.bindFunction(this._handle, name, normalizedRet, normalizedArgs, options);
    this._setCache(this._funcCache, cacheKey, bound);
    return bound;
  }

  funcAsync(name: string, retType: any, argTypes: any[]): (...args: any[]) => Promise<any> {
    this._checkAlive();

    const normalizedRet = normalizeType(retType);
    const normalizedArgs = argTypes.map(t => normalizeType(t));

    const cacheKey = 'async:' + name + '|' + serializeType(normalizedRet) + '|' + normalizedArgs.map(a => serializeType(a)).join(',');
    const cached = this._asyncCache.get(cacheKey);
    if (cached) return cached as any;

    let wrapper: (...args: any[]) => Promise<any>;

    if ((this._adapter as any)._isCustomBackend) {
      const backend = (this._adapter as CustomAdapterWrapper).getBackend();
      if (typeof backend.bindAsync === 'function') {
        const asyncFn = backend.bindAsync(this._handle, name, normalizedRet, normalizedArgs);
        wrapper = asyncFn;
      } else {
        const syncFn = this.func(name, retType, argTypes);
        wrapper = (...args: any[]) => {
          return new Promise((resolve, reject) => {
            try {
              resolve(syncFn(...args));
            } catch (e) {
              reject(e);
            }
          });
        };
        (wrapper as any)._isSyncFallback = true;
        if (!_globalWarnedAsync) {
          _globalWarnedAsync = true;
          const quiet = typeof process !== 'undefined' && process.env?.SENRI_FFI_QUIET;
          if (!quiet) {
            console.warn(
              '[SenRi FFI] funcAsync("' + name + '") fallback to synchronous call: ' +
              'the custom backend does not support bindAsync. The underlying C function MUST be thread-safe. ' +
              'To suppress: set SENRI_FFI_QUIET=1'
            );
          }
        }
      }
    } else if (isDenoRuntime()) {
      wrapper = async (...args: any[]) => {
        if (!this._workerChannel) {
          const { DenoChannel } = await import('./async/deno-channel');
          this._workerChannel = new DenoChannel();
          await this._workerChannel!.init(this._libPath);
          return this._workerChannel!.call(name, normalizedRet, normalizedArgs, args);
        }
        return this._workerChannel.call(name, normalizedRet, normalizedArgs, args);
      };
    } else if (isKossJSRuntime()) {
      const mappedRet = this._adapter.mapType(normalizedRet);
      const mappedArgs = normalizedArgs.map(t => this._adapter.mapType(t));
      const asyncFn = this._handle.funcAsync(name, mappedRet, mappedArgs);
      wrapper = (...args: any[]) => asyncFn(...args);
    } else if (isBunRuntime()) {
      const syncFn = this.func(name, retType, argTypes);
      wrapper = (...args: any[]) => {
        return new Promise((resolve, reject) => {
          try {
            resolve(syncFn(...args));
          } catch (e) {
            reject(e);
          }
        });
      };

      if (!_globalWarnedAsync) {
        _globalWarnedAsync = true;
        const quiet = (typeof process !== 'undefined' && process.env?.SENRI_FFI_QUIET)
          || (typeof (globalThis as any).Bun !== 'undefined' && (globalThis as any).Bun?.env?.SENRI_FFI_QUIET);
        if (!quiet) {
          console.warn(
            '[SenRi FFI] Async FFI on Bun uses Promise-wrapped synchronous calls. ' +
            'The underlying C function MUST be thread-safe. For true async FFI, consider using Deno. ' +
            'To suppress: set SENRI_FFI_QUIET=1'
          );
        }
      }
    } else {
      if (hasCallbackParam(argTypes)) {
        if (!_globalWarnedAsync) {
          _globalWarnedAsync = true;
          const quiet = (typeof process !== 'undefined' && process.env?.SENRI_FFI_QUIET)
            || (typeof (globalThis as any).Bun !== 'undefined' && (globalThis as any).Bun?.env?.SENRI_FFI_QUIET);
          if (!quiet) {
            console.warn(
              '[SenRi FFI] funcAsync("' + name + '") has callback parameters — executing synchronously ' +
              'on main thread. For non-blocking async, avoid callback parameters or use Deno. ' +
              'To suppress: set SENRI_FFI_QUIET=1'
            );
          }
        }
        const syncFn = this.func(name, retType, argTypes);
        wrapper = (...args: any[]) => {
          return new Promise((resolve, reject) => {
            try {
              resolve(syncFn(...args));
            } catch (e) {
              reject(e);
            }
          });
        };
      } else {
        wrapper = async (...args: any[]) => {
          if (!this._workerChannel) {
            const { NodeChannel } = await import('./async/node-channel');
            this._workerChannel = new NodeChannel();
            await this._workerChannel!.init(this._libPath);
            return this._workerChannel!.call(name, normalizedRet, normalizedArgs, args);
          }
          return this._workerChannel.call(name, normalizedRet, normalizedArgs, args);
        };

        if (!_globalWarnedAsync) {
          _globalWarnedAsync = true;
          const quiet = (typeof process !== 'undefined' && process.env?.SENRI_FFI_QUIET)
            || (typeof (globalThis as any).Bun !== 'undefined' && (globalThis as any).Bun?.env?.SENRI_FFI_QUIET);
          if (!quiet) {
            console.warn(
              '[SenRi FFI] Async FFI on Node.js is emulated using a worker thread. ' +
              'The underlying C function MUST be thread-safe. For true async FFI, consider using Deno. ' +
              'To suppress: set SENRI_FFI_QUIET=1'
            );
          }
        }
      }
    }

    this._setCache(this._asyncCache, cacheKey, wrapper);
    return wrapper;
  }

  get libPath(): string { return this._libPath; }

  close(): void {
    if (this._closed) return;
    this._adapter.closeLibrary(this._handle);
    this._funcCache.clear();
    this._handle = null;
    this._closed = true;
  }

  async closeAsync(): Promise<void> {
    if (this._closed) return;
    if (isKossJSRuntime() && this._handle && typeof this._handle.closeAsync === 'function') {
      await this._handle.closeAsync();
    } else {
      this.close();
    }
    if (this._workerChannel) {
      await this._workerChannel.shutdown();
      this._workerChannel = null;
    }
    this._asyncCache.clear();
  }
}
