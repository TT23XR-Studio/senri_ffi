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

import { AsyncChannel } from './channel';
import { NormalizedType, serializeType } from '../types/normalized';
import { serializeArgs } from './serializer';
import { getBunWorkerCode } from './bun-worker-code';

declare var Worker: any;

export class BunChannel implements AsyncChannel {
  private _worker: any = null;
  private _libPath: string = '';
  private _taskId: number = 0;
  private _pending: Map<number, { resolve: (v: any) => void; reject: (e: any) => void }> = new Map();

  async init(libPath: string): Promise<void> {
    this._libPath = libPath;
    const workerCode = getBunWorkerCode();
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    this._worker = new Worker(url);

    this._worker.onmessage = (event: any) => {
      const msg = event.data;
      const pending = this._pending.get(msg.taskId);
      if (!pending) return;
      this._pending.delete(msg.taskId);
      if (msg.type === 'result') {
        pending.resolve(msg.value);
      } else if (msg.type === 'error') {
        const errDesc = typeof msg.message === 'string' ? msg.message : JSON.stringify(msg);
        console.error('[BunChannel] Worker error:', errDesc);
        pending.reject(new Error(errDesc));
      }
    };

    this._worker.onerror = (err: any) => {
      const errMsg = (err && err.message ? err.message : '') || String(err);
      for (const [, p] of this._pending) {
        p.reject(new Error(errMsg));
      }
      this._pending.clear();
    };

    this._worker.postMessage({ type: 'bind', name: '__init__', cacheKey: '__init__', retType: '', argTypes: [], libPath });
  }

  async bind(_name: string, _retType: NormalizedType, _argTypes: NormalizedType[]): Promise<void> {
  }

  async call(name: string, retType: NormalizedType, argTypes: NormalizedType[], args: any[]): Promise<any> {
    const taskId = ++this._taskId;
    const cacheKey = name + '|' + serializeType(retType) + '|' + argTypes.map(a => serializeType(a)).join(',');
    const { serialized, transferList } = serializeArgs(args, argTypes);

    return new Promise((resolve, reject) => {
      this._pending.set(taskId, { resolve, reject });
      const msg: any = {
        type: 'call',
        taskId,
        name,
        cacheKey,
        args: serialized,
        retType: serializeType(retType),
        argTypes: argTypes.map(a => serializeType(a)),
      };
      this._worker.postMessage(msg, transferList);
    });
  }

  async shutdown(): Promise<void> {
    if (!this._worker) return;
    this._worker.postMessage({ type: 'shutdown' });
    this._worker = null;
  }
}
