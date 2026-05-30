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

let _adapter: any = null;

export function setLibraryAdapter(adapter: any): void {
  _adapter = adapter;
}

export class Library {
  private _handle: any;
  private _closed: boolean;
  private _funcCache: Map<string, Function>;

  private constructor(handle: any) {
    this._handle = handle;
    this._closed = false;
    this._funcCache = new Map();
  }

  static load(path: string): Library {
    if (!_adapter) throw new FFIError('Adapter not initialized');
    const handle = _adapter.createLibrary(path);
    return new Library(handle);
  }

  func(name: string, retType: any, argTypes: any[], options?: any): Function {
    if (this._closed) throw new FFIError('Library is closed');

    const cacheKey = name + '|' + JSON.stringify(retType) + '|' + JSON.stringify(argTypes);
    const cached = this._funcCache.get(cacheKey);
    if (cached) return cached;

    const bound = _adapter.bindFunction(this._handle, name, retType, argTypes, options);
    this._funcCache.set(cacheKey, bound);
    return bound;
  }

  close(): void {
    if (this._closed) return;
    _adapter.closeLibrary(this._handle);
    this._funcCache.clear();
    this._handle = null;
    this._closed = true;
  }
}
