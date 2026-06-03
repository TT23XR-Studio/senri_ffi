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
 * AUTO-GENERATED from src/async/bun-worker.ts — DO NOT EDIT MANUALLY.
 * Regenerate with: npx tsx scripts/generate-worker-code.ts --bun
 */

export function getBunWorkerCode(): string {
  return `
var BUN_MAP = {
  void:    'void',
  int8:    'i8',
  uint8:   'u8',
  int16:   'i16',
  uint16:  'u16',
  int32:   'i32',
  uint32:  'u32',
  int64:   'i64',
  uint64:  'u64',
  float32: 'f32',
  float64: 'f64',
  pointer: 'ptr',
  cstring: 'cstring',
};

var _libHandle = null;
var _funcCache = new Map();

function mapType(typeStr){
  return BUN_MAP[typeStr] || 'ptr';
}

function parseType(typeStr){
  if (typeStr.startsWith('p:')) {
    return mapType(typeStr.substring(2));
  }
  if (typeStr.startsWith('*')) {
    return 'ptr';
  }
  if (typeStr.startsWith('[')) {
    var end = typeStr.indexOf(']');
    var inner = parseType(typeStr.substring(end + 1));
    return inner;
  }
  return mapType(typeStr);
}

function parseTypes(argTypeStrs){
  return argTypeStrs.map(s => parseType(s));
}

function allocBuf(size){
  var buf = new ArrayBuffer(size);
  var u8 = new Uint8Array(buf);
  u8.fill(0);
  var ptr = Bun.FFI.ptr ? Bun.FFI.ptr(buf) : 0;
  return { __ptr: BigInt(typeof ptr === 'bigint' ? ptr : ptr || 0), __buf: buf, __size: size, __u8: u8 };
}

function freeBuf(ptr){
  if (ptr) { ptr.__buf = null; ptr.__u8 = null; }
}

function getAddress(buf){
  return BigInt(Bun.FFI.ptr ? Bun.FFI.ptr(buf) : 0);
}

self.onmessage = (event) => {
  var msg = event.data;
  switch (msg.type) {
    case 'bind': {
      if (msg.name === '__init__') {
        _libHandle = Bun.FFI.dlopen(msg.libPath, {});
        self.postMessage({ type: 'result', taskId: 0, value: true });
        return;
      }
      var nativeRet = parseType(msg.retType);
      var nativeArgs = parseTypes(msg.argTypes);
      var dl = Bun.FFI.dlopen(msg.libPath || _libHandle?.__path, {
        [msg.name]: { returns: nativeRet, args: nativeArgs },
      });
      var fn = dl.symbols ? dl.symbols[msg.name] : dl[msg.name];
      if (fn) _funcCache.set(msg.cacheKey, fn);
      self.postMessage({ type: 'result', taskId: 0, value: true });
      break;
    }
    case 'call': {
      try {
        var fn = _funcCache.get(msg.cacheKey);
        if (!fn) {
          var nativeRet = parseType(msg.retType);
          var nativeArgs = parseTypes(msg.argTypes);
          var dl = Bun.FFI.dlopen(msg.libPath || _libHandle?.__path, {
            [msg.name]: { returns: nativeRet, args: nativeArgs },
          });
          fn = dl.symbols ? dl.symbols[msg.name] : dl[msg.name];
          if (fn) _funcCache.set(msg.cacheKey, fn);
          else throw new Error('Symbol not found: ' + msg.name);
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
        for (var t of tempAllocs) freeBuf(t);

        self.postMessage({
          type: 'result',
          taskId: msg.taskId,
          value: raw,
        });
      } catch (e) {
        self.postMessage({
          type: 'error',
          taskId: msg.taskId,
          message: e.message,
        });
      }
      break;
    }
    case 'shutdown': {
      _libHandle = null;
      _funcCache.clear();
      self.close();
      break;
    }
  }
};

`;
}
