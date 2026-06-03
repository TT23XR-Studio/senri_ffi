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

import { Worker } from 'worker_threads';
import { AsyncChannel } from './channel';
import { NormalizedType, serializeType } from '../types/normalized';
import { serializeArgs, deserializeResult } from './serializer';
import { MainToWorkerMessage, WorkerToMainMessage } from './types';
import { getNodeWorkerCode } from './node-worker-code';

export class NodeChannel implements AsyncChannel {
  private _worker: Worker | null = null;
  private _libPath: string = '';
  private _taskId: number = 0;
  private _pending: Map<number, { resolve: (v: any) => void; reject: (e: any) => void }> = new Map();

  async init(libPath: string): Promise<void> {
    this._libPath = libPath;
    const workerCode = getNodeWorkerCode();
    this._worker = new Worker(workerCode, { eval: true });

    this._worker.on('message', (msg: WorkerToMainMessage) => {
      const pending = this._pending.get(msg.taskId);
      if (!pending) return;
      this._pending.delete(msg.taskId);
      if (msg.type === 'result') {
        pending.resolve(msg.value);
      } else if (msg.type === 'error') {
        pending.reject(new Error(msg.message));
      }
    });

    this._worker.on('error', (err: Error) => {
      for (const [, p] of this._pending) {
        p.reject(err);
      }
      this._pending.clear();
    });

    this._worker.on('exit', () => {
      for (const [, p] of this._pending) {
        p.reject(new Error('Worker exited unexpectedly'));
      }
      this._pending.clear();
    });

    this._sendMsg({ type: 'bind', name: '__init__', cacheKey: '__init__', retType: '', argTypes: [], libPath });
  }

  async bind(_name: string, _retType: NormalizedType, _argTypes: NormalizedType[]): Promise<void> {
  }

  async call(name: string, retType: NormalizedType, argTypes: NormalizedType[], args: any[]): Promise<any> {
    const taskId = ++this._taskId;
    const cacheKey = name + '|' + serializeType(retType) + '|' + argTypes.map(a => serializeType(a)).join(',');
    const { serialized, transferList } = serializeArgs(args, argTypes);

    return new Promise((resolve, reject) => {
      this._pending.set(taskId, { resolve, reject });
      this._sendMsg({
        type: 'call',
        taskId,
        name,
        cacheKey,
        args: serialized,
        retType: serializeType(retType),
        argTypes: argTypes.map(a => serializeType(a)),
        transferList,
      } as any);
    });
  }

  private _sendMsg(msg: any): void {
    if (!this._worker) throw new Error('Worker not initialized');
    const transfer: ArrayBuffer[] = msg.transferList || [];
    delete msg.transferList;
    this._worker.postMessage(msg, transfer);
  }

  async shutdown(): Promise<void> {
    if (!this._worker) return;
    return new Promise((resolve) => {
      this._worker!.once('exit', resolve);
      this._sendMsg({ type: 'shutdown' });
      setTimeout(resolve, 5000);
    });
  }
}
