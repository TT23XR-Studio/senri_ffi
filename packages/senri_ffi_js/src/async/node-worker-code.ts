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
 *
 * AUTO-GENERATED from src/async/node-worker.ts — DO NOT EDIT MANUALLY.
 * Regenerate with: npx tsx scripts/generate-worker-code.ts
 */

export function getNodeWorkerCode(): string {
  return `
var { parentPort } = require('worker_threads');

var koffi = require('koffi');

function mapType(typeStr){
  if (typeStr === 'cstring') return 'string';
  if (typeStr === 'pointer') return 'void *';
  return typeStr;
}

function parseType(typeStr){
  if (typeStr.startsWith('p:')) {
    return mapType(typeStr.substring(2));
  }
  if (typeStr.startsWith('*')) {
    var inner = parseType(typeStr.substring(1));
    return koffi.pointer(inner);
  }
  if (typeStr.startsWith('[')) {
    var end = typeStr.indexOf(']');
    var length = parseInt(typeStr.substring(1, end));
    var inner = parseType(typeStr.substring(end + 1));
    return koffi.array(inner, length);
  }
  return mapType(typeStr);
}

function parseTypes(argTypeStrs){
  return argTypeStrs.map(s => parseType(s));
}

function allocBuf(size){
  var buf = Buffer.allocUnsafe(size);
  var addr = koffi.address ? koffi.address(buf) : buf;
  return { __ptr: BigInt(addr), __buf: buf, __size: size };
}

function freeBuf(ptr){
  if (ptr && ptr.__buf) ptr.__buf = null;
}

function getAddress(buf){
  return BigInt(koffi.address ? koffi.address(buf) : buf);
}

var _libHandle = null;
var _libPath = null;
var _funcCache = new Map();

parentPort.on('message', (msg) => {
  switch (msg.type) {
    case 'bind': {
      if (msg.name === '__init__') {
        _libPath = msg.libPath;
        _libHandle = koffi.load(msg.libPath);
        return;
      }
      var nativeRet = parseType(msg.retType);
      var nativeArgs = parseTypes(msg.argTypes);
      var fn2 = _libHandle.func(msg.name, nativeRet, nativeArgs);
      _funcCache.set(msg.cacheKey, fn2);
      break;
    }
    case 'call': {
      try {
        var fn = _funcCache.get(msg.cacheKey);
        if (!fn) {
          var nativeRet = parseType(msg.retType);
          var nativeArgs = parseTypes(msg.argTypes);
          fn = _libHandle.func(msg.name, nativeRet, nativeArgs);
          if (!fn) throw new Error('Failed to bind function: ' + msg.name);
          _funcCache.set(msg.cacheKey, fn);
        }

        var tempAllocs = [];
        var nativeArgs = [];

        for (var arg of msg.args) {
          if (arg && typeof arg === 'object') {
            if (arg.$ === 'bigint') {
              nativeArgs.push(BigInt(arg.v));
            } else if (arg.$ === 'pointer') {
              nativeArgs.push(BigInt(arg.v));
            } else if (arg.$ === 'cstring') {
              nativeArgs.push(arg.v);
            } else if (arg.$ === 'struct') {
              var buf = allocBuf(arg.size);
              var dst = new Uint8Array(buf.__buf);
              var srcBuf = new Uint8Array(arg.buf);
              dst.set(srcBuf);
              tempAllocs.push(buf);
              nativeArgs.push(buf.__ptr);
            }
          } else {
            nativeArgs.push(arg);
          }
        }

        var raw = fn(...nativeArgs);

        var value = raw;
        if (msg.retType && typeof raw === 'object' && raw !== null) {
          value = raw;
        } else if (typeof raw === 'bigint' || typeof raw === 'number') {
          value = raw;
        }

        for (var t of tempAllocs) freeBuf(t);
        parentPort.postMessage({
          type: 'result',
          taskId: msg.taskId,
          value,
        });
      } catch (e) {
        parentPort.postMessage({
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

`;
}
