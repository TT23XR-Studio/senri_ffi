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

const _memoryBlocks: Set<any> = new Set();
const _callbacks: Set<any> = new Set();

export class ResourceRegistry {
  registerMemory(block: any): void {
    _memoryBlocks.add(block);
  }

  unregisterMemory(block: any): void {
    _memoryBlocks.delete(block);
  }

  registerCallback(cb: any): void {
    _callbacks.add(cb);
  }

  unregisterCallback(cb: any): void {
    _callbacks.delete(cb);
  }

  hasActiveResources(): boolean {
    return _memoryBlocks.size > 0 || _callbacks.size > 0;
  }

  getActiveMemoryCount(): number {
    return _memoryBlocks.size;
  }

  getActiveCallbackCount(): number {
    return _callbacks.size;
  }

  forEachMemory(fn: (block: any) => void): void {
    for (const block of _memoryBlocks) {
      fn(block);
    }
  }

  forEachCallback(fn: (cb: any) => void): void {
    for (const cb of _callbacks) {
      fn(cb);
    }
  }

  clear(): void {
    _memoryBlocks.clear();
    _callbacks.clear();
  }
}

let _instance: ResourceRegistry | null = null;

export function getResourceRegistry(): ResourceRegistry {
  if (!_instance) {
    _instance = new ResourceRegistry();
  }
  return _instance;
}
