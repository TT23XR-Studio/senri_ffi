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

import { Pointer, PTR_BRAND } from './pointer';
import { FFIError } from './errors';
import { getGlobalAdapter } from './globals';
import { getResourceRegistry } from './resource-registry';

export function alloc(size: number): Pointer {
  if (typeof size !== 'number' || size <= 0) throw new FFIError('alloc requires a positive size');
  const adapter = getGlobalAdapter();
  const result = adapter.alloc(size);
  getResourceRegistry().registerMemory(result);
  return new Pointer(result);
}

export function free(ptr: Pointer | any): void {
  const adapter = getGlobalAdapter();
  const data = ptr instanceof Pointer ? ptr._data : ptr;
  getResourceRegistry().unregisterMemory(data);
  adapter.free(data);
}

export function addressOf(buffer: ArrayBuffer | ArrayBufferView): Pointer {
  if (!buffer || typeof buffer !== 'object') throw new FFIError('addressOf requires ArrayBuffer or TypedArray');
  const adapter = getGlobalAdapter();
  const addr = adapter.addressOf(buffer);
  return new Pointer({ __ptr: addr, __buf: buffer, __size: buffer.byteLength || (buffer as any).length || 0, [PTR_BRAND]: true });
}

export function errno(): number {
  try {
    return getGlobalAdapter().getErrno();
  } catch {
    return 0;
  }
}

export function strerror(code: number = 0): string {
  try {
    return getGlobalAdapter().getStrerror(code);
  } catch {
    return '';
  }
}
