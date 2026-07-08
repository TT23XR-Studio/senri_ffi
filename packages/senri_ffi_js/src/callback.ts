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
import { getGlobalAdapter } from './globals';
import { getResourceRegistry } from './resource-registry';
import { normalizeType } from './types/normalized';

let _finalizationRegistry: FinalizationRegistry<object> | null = null;

export function callback(retType: any, argTypes: any[], jsFn: Function, options?: any): Pointer {
  if (typeof jsFn !== 'function') throw new FFIError('callback requires a function');

  const adapter = getGlobalAdapter();
  const normalizedRet = normalizeType(retType);
  const normalizedArgs = argTypes.map(t => normalizeType(t));

  const desc = adapter.registerCallback(jsFn, normalizedRet, normalizedArgs);
  (desc as any)._unregister = () => {
    getResourceRegistry().unregisterCallback(desc);
    adapter.unregisterCallback(desc);
  };
  getResourceRegistry().registerCallback(desc);

  const pointer = new Pointer(desc);

  if (typeof FinalizationRegistry !== 'undefined') {
    if (!_finalizationRegistry) {
      _finalizationRegistry = new FinalizationRegistry((held: any) => {
        if (held && typeof held._unregister === 'function') {
          try { held._unregister(); } catch {}
        }
      });
    }
    _finalizationRegistry.register(pointer, desc);
  }

  return pointer;
}
