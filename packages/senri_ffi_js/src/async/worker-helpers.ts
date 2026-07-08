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

import { Pointer } from '../pointer';
import { NormalizedType } from '../types/normalized';
import { SerializedArg } from './types';

export function unmarshalArgs(
  args: SerializedArg[],
  types: NormalizedType[],
  allocFn: (size: number) => any,
  freeFn: (ptr: any) => void
): { nativeArgs: any[]; tempAllocs: any[] } {
  const nativeArgs: any[] = [];
  const tempAllocs: any[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const type = types[i];

    switch (type.kind) {
      case 'primitive': {
        switch (type.name) {
          case 'int64': case 'uint64':
            nativeArgs.push(BigInt((arg as any).v));
            break;
          case 'cstring': {
            const str = (arg as any).v as string;
            nativeArgs.push(str);
            break;
          }
          case 'pointer':
            nativeArgs.push(BigInt((arg as any).v));
            break;
          default:
            nativeArgs.push(arg);
            break;
        }
        break;
      }
      case 'pointer': {
        nativeArgs.push(BigInt((arg as any).v));
        break;
      }
      case 'array': {
        nativeArgs.push(BigInt((arg as any).v));
        break;
      }
      case 'struct': {
        const st = arg as any;
        if (st.$ === 'struct' && st.buf) {
          const buf = allocFn(st.size);
          const src = new Uint8Array(st.buf);
          const dst = new Uint8Array(buf.__buf || buf);
          dst.set(src);
          tempAllocs.push(buf);
          nativeArgs.push(buf.__ptr || BigInt(0));
        } else {
          nativeArgs.push(BigInt(st.v || 0));
        }
        break;
      }
    }
  }

  return { nativeArgs, tempAllocs };
}

export function marshalResult(
  raw: any,
  retType: NormalizedType,
  getAddressFn?: (buf: any) => bigint
): any {
  if (raw === undefined || raw === null) return raw;

  switch (retType.kind) {
    case 'primitive': {
      switch (retType.name) {
        case 'int64': case 'uint64':
          return { $: 'bigint', v: String(raw) };
        case 'pointer':
          if (typeof raw === 'object' && raw.__ptr !== undefined) {
            return { $: 'pointer', v: String(raw.__ptr) };
          }
          if (typeof raw === 'bigint') return { $: 'pointer', v: String(raw) };
          return { $: 'pointer', v: String(getAddressFn ? getAddressFn(raw) : 0n) };
        case 'cstring':
          if (typeof raw === 'object' && raw.__ptr !== undefined && getAddressFn) {
            const ptr = new Pointer(raw);
            return ptr.readCString();
          }
          return String(raw);
        default: return raw;
      }
    }
    case 'pointer':
      if (typeof raw === 'object' && raw.__ptr !== undefined) {
        return { $: 'pointer', v: String(raw.__ptr) };
      }
      if (typeof raw === 'bigint') return { $: 'pointer', v: String(raw) };
      return { $: 'pointer', v: String(raw) };
    default: return raw;
  }
}
