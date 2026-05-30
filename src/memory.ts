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

import { Pointer } from './pointer';
import { FFIError } from './errors';

let _adapter: any = null;

export function setMemoryAdapter(adapter: any): void {
  _adapter = adapter;
}

export function alloc(size: number): Pointer {
  if (!_adapter) throw new FFIError('Adapter not initialized');
  if (typeof size !== 'number' || size <= 0) throw new FFIError('alloc requires a positive size');
  return new Pointer(_adapter.allocMemory(size));
}

export function free(ptr: Pointer | any): void {
  if (!_adapter) throw new FFIError('Adapter not initialized');
  const data = ptr instanceof Pointer ? ptr._data : ptr;
  _adapter.freeMemory(data);
}

export function addressOf(buffer: ArrayBuffer | ArrayBufferView): Pointer {
  if (!_adapter) throw new FFIError('Adapter not initialized');
  if (!buffer || typeof buffer !== 'object') throw new FFIError('addressOf requires ArrayBuffer or TypedArray');
  return new Pointer(_adapter.getAddressOf(buffer));
}

export function errno(): number {
  if (!_adapter) return 0;
  return _adapter.getErrno();
}

export function strerror(code: number = 0): string {
  if (!_adapter) return '';
  return _adapter.getStrerror(code);
}
