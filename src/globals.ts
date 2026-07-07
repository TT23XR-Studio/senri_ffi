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

import { FFIAdapter } from './types/adapter';
import { FFIError } from './errors';
import { getResourceRegistry } from './resource-registry';

let _adapter: FFIAdapter | null = null;
let _version = 0;

export function setGlobalAdapter(adapter: FFIAdapter, force?: boolean): void {
  if (_adapter && _adapter !== adapter) {
    const registry = getResourceRegistry();
    if (registry.hasActiveResources()) {
      if (!force) {
        const memCount = registry.getActiveMemoryCount();
        const cbCount = registry.getActiveCallbackCount();
        throw new FFIError(
          'Cannot switch FFI backend: there are ' + memCount + ' active memory allocation(s) and ' +
          cbCount + ' active callback(s). Free all resources before switching, ' +
          'or pass `true` as the second argument to setGlobalAdapter to force switch (risky).'
        );
      }
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(
          '[SenRi FFI] WARNING: Force-switching adapter with active resources. ' +
          'Existing pointers and callbacks may cause crashes or memory leaks.'
        );
      }
      registry.clear();
    }
  }
  _adapter = adapter;
  _version++;
}

export function getGlobalAdapter(): FFIAdapter {
  if (!_adapter) throw new FFIError('Adapter not initialized');
  return _adapter;
}

export function getGlobalAdapterVersion(): number {
  return _version;
}

export function isAdapterInitialized(): boolean {
  return _adapter !== null;
}
