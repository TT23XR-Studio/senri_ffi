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

export interface SerializedBigInt {
  $: 'bigint';
  v: string;
}

export interface SerializedPointer {
  $: 'pointer';
  v: string;
}

export interface SerializedCString {
  $: 'cstring';
  v: string;
}

export interface SerializedStruct {
  $: 'struct';
  buf: ArrayBuffer;
  size: number;
}

export type SerializedArg = number | string | SerializedBigInt | SerializedPointer | SerializedCString | SerializedStruct;

export interface BindMessage {
  type: 'bind';
  name: string;
  cacheKey: string;
  retType: string;
  argTypes: string[];
}

export interface CallMessage {
  type: 'call';
  taskId: number;
  name: string;
  cacheKey: string;
  args: SerializedArg[];
  transferList?: ArrayBuffer[];
}

export interface ResultMessage {
  type: 'result';
  taskId: number;
  value?: any;
}

export interface ErrorMessage {
  type: 'error';
  taskId: number;
  message: string;
}

export interface ShutdownMessage {
  type: 'shutdown';
}

export type WorkerToMainMessage = ResultMessage | ErrorMessage;
export type MainToWorkerMessage = BindMessage | CallMessage | ShutdownMessage;
