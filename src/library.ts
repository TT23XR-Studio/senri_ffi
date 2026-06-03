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

import { FFIError } from './errors';
import { FFIAdapter } from './types/adapter';
import { NormalizedType, normalizeType, serializeType } from './types/normalized';
import { AsyncChannel } from './async/channel';

let _adapter: FFIAdapter | null = null;
let _globalWarnedAsync: boolean = false;

const MAX_CACHE_SIZE = 500;

declare var globalThis: any;

export function setLibraryAdapter(adapter: FFIAdapter): void {
  _adapter = adapter;
}

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

export class Library {
  private _handle: any;
  private _libPath: string;
  private _closed: boolean;
  private _funcCache: Map<string, Function>;
  private _asyncCache: Map<string, any>;
  private _workerChannel: AsyncChannel | null = null;

  private constructor(handle: any, path: string) {
    this._handle = handle;
    this._libPath = path;
    this._closed = false;
    this._funcCache = new Map();
    this._asyncCache = new Map();
  }

  private _setCache(map: Map<string, any>, key: string, value: any): void {
    if (map.size >= MAX_CACHE_SIZE) {
      const oldest = map.keys().next().value;
      if (oldest !== undefined) map.delete(oldest);
    }
    map.set(key, value);
  }

  static load(path: string): Library {
    if (!_adapter) throw new FFIError('Adapter not initialized');
    const handle = _adapter.loadLibrary(path);
    return new Library(handle, path);
  }

  func(name: string, retType: any, argTypes: any[], options?: any): Function {
    if (this._closed) throw new FFIError('Library is closed');
    if (!_adapter) throw new FFIError('Adapter not initialized');

    const normalizedRet = normalizeType(retType);
    const normalizedArgs = argTypes.map(t => normalizeType(t));

    const cacheKey = name + '|' + serializeType(normalizedRet) + '|' + normalizedArgs.map(a => serializeType(a)).join(',');
    const cached = this._funcCache.get(cacheKey);
    if (cached) return cached;

    const bound = _adapter.bindFunction(this._handle, name, normalizedRet, normalizedArgs, options);
    this._setCache(this._funcCache, cacheKey, bound);
    return bound;
  }

  funcAsync(name: string, retType: any, argTypes: any[]): (...args: any[]) => Promise<any> {
    if (this._closed) throw new FFIError('Library is closed');
    if (!_adapter) throw new FFIError('Adapter not initialized');

    const normalizedRet = normalizeType(retType);
    const normalizedArgs = argTypes.map(t => normalizeType(t));

    const cacheKey = 'async:' + name + '|' + serializeType(normalizedRet) + '|' + normalizedArgs.map(a => serializeType(a)).join(',');
    const cached = this._asyncCache.get(cacheKey);
    if (cached) return cached as any;

    let wrapper: (...args: any[]) => Promise<any>;

    if (isDenoRuntime()) {
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
      if (!_adapter) throw new FFIError('Adapter not initialized');
      const mappedRet = _adapter.mapType(normalizedRet);
      const mappedArgs = normalizedArgs.map(t => _adapter!.mapType(t));
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
    if (_adapter) _adapter.closeLibrary(this._handle);
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
