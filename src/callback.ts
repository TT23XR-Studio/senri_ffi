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
import { FFIAdapter } from './types/adapter';
import { normalizeType } from './types/normalized';

let _adapter: FFIAdapter | null = null;
let _finalizationRegistry: FinalizationRegistry<object> | null = null;

export function setCallbackAdapter(adapter: FFIAdapter): void {
  _adapter = adapter;
}

export function callback(retType: any, argTypes: any[], jsFn: Function, options?: any): Pointer {
  if (!_adapter) throw new FFIError('Adapter not initialized');
  if (typeof jsFn !== 'function') throw new FFIError('callback requires a function');

  const normalizedRet = normalizeType(retType);
  const normalizedArgs = argTypes.map(t => normalizeType(t));

  const ptr = _adapter.registerCallback(jsFn, normalizedRet, normalizedArgs);
  const pointer = new Pointer(ptr);

  if (typeof FinalizationRegistry !== 'undefined') {
    if (!_finalizationRegistry) {
      _finalizationRegistry = new FinalizationRegistry((held: any) => {
        if (_adapter && typeof _adapter.unregisterCallback === 'function') {
          _adapter.unregisterCallback(held);
        }
      });
    }
    _finalizationRegistry.register(pointer, ptr);
  }

  return pointer;
}
