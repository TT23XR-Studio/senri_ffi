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

import { parentPort } from 'worker_threads';

const koffi = require('koffi');

function mapType(typeStr: string): any {
  if (typeStr === 'cstring') return 'string';
  if (typeStr === 'pointer') return 'void *';
  return typeStr;
}

function parseType(typeStr: string): any {
  if (typeStr.startsWith('p:')) {
    return mapType(typeStr.substring(2));
  }
  if (typeStr.startsWith('*')) {
    const inner = parseType(typeStr.substring(1));
    return koffi.pointer(inner);
  }
  if (typeStr.startsWith('[')) {
    const end = typeStr.indexOf(']');
    const length = parseInt(typeStr.substring(1, end));
    const inner = parseType(typeStr.substring(end + 1));
    return koffi.array(inner, length);
  }
  return mapType(typeStr);
}

function parseTypes(argTypeStrs: string[]): any[] {
  return argTypeStrs.map(s => parseType(s));
}

function allocBuf(size: number): any {
  const buf = Buffer.allocUnsafe(size);
  const addr = koffi.address ? koffi.address(buf) : buf;
  return { __ptr: BigInt(addr), __buf: buf, __size: size };
}

function freeBuf(ptr: any): void {
  if (ptr && ptr.__buf) ptr.__buf = null;
}

function getAddress(buf: any): bigint {
  return BigInt(koffi.address ? koffi.address(buf) : buf);
}

let _libHandle: any = null;
let _libPath: string | null = null;
const _funcCache: Map<string, Function> = new Map();

parentPort!.on('message', (msg: any) => {
  switch (msg.type) {
    case 'bind': {
      if (msg.name === '__init__') {
        _libPath = msg.libPath;
        _libHandle = koffi.load(msg.libPath);
        return;
      }
      const nativeRet = parseType(msg.retType);
      const nativeArgs = parseTypes(msg.argTypes);
      const fn2 = _libHandle.func(msg.name, nativeRet, nativeArgs);
      _funcCache.set(msg.cacheKey, fn2);
      break;
    }
    case 'call': {
      try {
        let fn: any = _funcCache.get(msg.cacheKey);
        if (!fn) {
          const nativeRet = parseType(msg.retType);
          const nativeArgs = parseTypes(msg.argTypes);
          fn = _libHandle.func(msg.name, nativeRet, nativeArgs);
          if (!fn) throw new Error('Failed to bind function: ' + msg.name);
          _funcCache.set(msg.cacheKey, fn);
        }

        const tempAllocs: any[] = [];
        const nativeArgs: any[] = [];

        for (const arg of msg.args) {
          if (arg && typeof arg === 'object') {
            if (arg.$ === 'bigint') {
              nativeArgs.push(BigInt(arg.v));
            } else if (arg.$ === 'pointer') {
              nativeArgs.push(BigInt(arg.v));
            } else if (arg.$ === 'cstring') {
              nativeArgs.push(arg.v);
            } else if (arg.$ === 'struct') {
              const buf = allocBuf(arg.size);
              const dst = new Uint8Array(buf.__buf);
              const srcBuf = new Uint8Array(arg.buf);
              dst.set(srcBuf);
              tempAllocs.push(buf);
              nativeArgs.push(buf.__ptr);
            }
          } else {
            nativeArgs.push(arg);
          }
        }

        const raw = fn(...nativeArgs);

        let value: any = raw;
        if (msg.retType && typeof raw === 'object' && raw !== null) {
          value = raw;
        } else if (typeof raw === 'bigint' || typeof raw === 'number') {
          value = raw;
        }

        for (const t of tempAllocs) freeBuf(t);
        parentPort!.postMessage({
          type: 'result',
          taskId: msg.taskId,
          value,
        });
      } catch (e: any) {
        parentPort!.postMessage({
          type: 'error',
          taskId: msg.taskId,
          message: e.message,
        });
      }
      break;
    }
    case 'shutdown': {
      if (_libHandle && typeof _libHandle.close === 'function') {
        _libHandle.close();
      }
      _libHandle = null;
      _funcCache.clear();
      process.exit(0);
      break;
    }
  }
});
