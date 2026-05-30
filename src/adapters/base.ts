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

export abstract class BaseAdapter {
  mapType(unifiedType: any): any { throw new Error('Not implemented'); }
  createLibrary(path: string): any { throw new Error('Not implemented'); }
  closeLibrary(handle: any): void { throw new Error('Not implemented'); }
  bindFunction(libHandle: any, name: string, retType: any, argTypes: any[], options?: any): any { throw new Error('Not implemented'); }
  createStructType(fields: Record<string, any>, packed?: number, size?: number, align?: number): any { throw new Error('Not implemented'); }
  createPointerType(innerType: any): any { throw new Error('Not implemented'); }
  createArrayType(innerType: any, length: number): any { throw new Error('Not implemented'); }
  allocMemory(size: number): any { throw new Error('Not implemented'); }
  freeMemory(ptr: any): void { throw new Error('Not implemented'); }
  getAddressOf(buffer: any): any { throw new Error('Not implemented'); }
  createCallback(retType: any, argTypes: any[], jsFn: Function, options?: any): any { throw new Error('Not implemented'); }
  releaseCallback(ptr: any): void { throw new Error('Not implemented'); }
  getErrno(): number { throw new Error('Not implemented'); }
  getStrerror(errno: number): string { throw new Error('Not implemented'); }
}
