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

import { NormalizedType } from '../types/normalized';
import { FFIError } from '../errors';
import { Pointer } from '../pointer';
import { SerializedArg } from './types';

export function serializeArgs(args: any[], types: NormalizedType[]): { serialized: SerializedArg[]; transferList: ArrayBuffer[] } {
  const serialized: SerializedArg[] = [];
  const transferList: ArrayBuffer[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const type = types[i];

    switch (type.kind) {
      case 'primitive': {
        switch (type.name) {
          case 'int64': case 'uint64':
            serialized.push({ $: 'bigint', v: String(arg) });
            break;
          case 'cstring':
            serialized.push({ $: 'cstring', v: String(arg) });
            break;
          case 'pointer':
            if (arg instanceof Pointer) {
              serialized.push({ $: 'pointer', v: String(arg.address) });
            } else {
              serialized.push({ $: 'pointer', v: String(BigInt(arg)) });
            }
            break;
          default:
            serialized.push(arg);
            break;
        }
        break;
      }
      case 'pointer': {
        if (arg instanceof Pointer) {
          serialized.push({ $: 'pointer', v: String(arg.address) });
        } else {
          serialized.push({ $: 'pointer', v: String(BigInt(arg)) });
        }
        break;
      }
      case 'array': {
        if (arg instanceof Pointer) {
          serialized.push({ $: 'pointer', v: String(arg.address) });
        } else if (arg && arg.buffer instanceof ArrayBuffer) {
          serialized.push({ $: 'pointer', v: '0' });
        } else {
          serialized.push({ $: 'pointer', v: String(BigInt(arg)) });
        }
        break;
      }
      case 'struct': {
        if (arg && arg._buffer instanceof ArrayBuffer) {
          const buf = arg._buffer.slice(0);
          serialized.push({ $: 'struct', buf, size: type.size });
          transferList.push(buf);
        } else if (arg instanceof Pointer) {
          const buf = new ArrayBuffer(type.size);
          if (arg._data && arg._data.__buf) {
            const src = new Uint8Array(arg._data.__buf, 0, type.size);
            new Uint8Array(buf).set(src);
          }
          serialized.push({ $: 'struct', buf, size: type.size });
          transferList.push(buf);
        } else {
          throw new FFIError('Cannot serialize struct argument: expected struct instance or Pointer');
        }
        break;
      }
      default:
        throw new FFIError('Cannot serialize argument of type: ' + JSON.stringify(type));
    }
  }

  return { serialized, transferList };
}

export function deserializeResult(raw: any, retType: NormalizedType): any {
  if (raw === undefined || raw === null) return raw;

  switch (retType.kind) {
    case 'primitive': {
      switch (retType.name) {
        case 'int64': case 'uint64': {
          if (raw && raw.$ === 'bigint') return BigInt(raw.v);
          return BigInt(raw);
        }
        case 'pointer': {
          if (raw && raw.$ === 'pointer') return new Pointer(BigInt(raw.v));
          return typeof raw === 'bigint' ? new Pointer(raw) : new Pointer();
        }
        case 'cstring': return String(raw);
        default: return raw;
      }
    }
    case 'pointer': {
      if (raw && raw.$ === 'pointer') return new Pointer(BigInt(raw.v));
      return typeof raw === 'bigint' ? new Pointer(raw) : new Pointer();
    }
    default: return raw;
  }
}
