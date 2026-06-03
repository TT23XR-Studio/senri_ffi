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

import { NormalizedType } from './normalized';

export interface FFIAdapter {
  loadLibrary(path: string): any;
  bindFunction(libHandle: any, name: string, retType: NormalizedType, argTypes: NormalizedType[], options?: any): (...args: any[]) => any;
  closeLibrary(libHandle: any): void;

  alloc(size: number): any;
  free(ptr: any): void;
  addressOf(buffer: ArrayBuffer | ArrayBufferView): bigint;

  registerCallback(func: Function, retType: NormalizedType, argTypes: NormalizedType[]): any;
  unregisterCallback(ptr: any): void;

  getErrno(): number;
  getStrerror(errno: number): string;

  mapType(type: NormalizedType): any;
  createPointerType(ofType: NormalizedType): any;
  createArrayType(ofType: NormalizedType, length: number): any;
  createStructType(fields: Record<string, NormalizedType>, packed?: number, size?: number, align?: number): any;
}
