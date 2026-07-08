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

import { computeLayout, FieldInfo } from './types/utils';
import { Pointer } from './pointer';

export interface StructClass {
  new (init?: Record<string, any>): StructInstance;
  readonly sizeof: number;
  readonly align: number;
  fromPointer(ptr: any): StructInstance;
  fields: Record<string, any>;
  packed?: number;
}

export interface StructInstance {
  _buffer: ArrayBuffer;
  _view: DataView;
  _fields: FieldInfo[];
  readonly ptr: Pointer;
  toPointer(): Pointer;
  [key: string]: any;
}

let _allocNative: ((size: number) => any) | null = null;
let _freeNative: ((ptr: any) => void) | null = null;

export function setStructAlloc(alloc: (size: number) => any, free: (ptr: any) => void): void {
  _allocNative = alloc;
  _freeNative = free;
}

export function createStruct(fields: Record<string, any>, options?: { packed?: number }): any {
  const packed = options && options.packed;
  const { fieldInfos, totalSize, maxAlign } = computeLayout(fields, packed);

  class StructInstance {
    _buffer: ArrayBuffer;
    _view: DataView;
    _fields: FieldInfo[];

    static get sizeof(): number { return totalSize; }
    static get align(): number { return maxAlign; }

    static fromPointer(ptr: any): StructInstance {
      const inst = Object.create(StructInstance.prototype) as StructInstance;
      inst._buffer = new ArrayBuffer(totalSize);
      inst._view = new DataView(inst._buffer);
      inst._fields = fieldInfos;
      const srcPtr = ptr instanceof Pointer ? ptr : new Pointer(ptr);
      if (srcPtr._data && srcPtr._data.__buf) {
        const src = new Uint8Array(srcPtr._data.__buf);
        const dst = new Uint8Array(inst._buffer);
        dst.set(src.slice(0, totalSize));
      }
      return inst;
    }

    constructor(init?: Record<string, any>) {
      this._buffer = new ArrayBuffer(totalSize);
      this._view = new DataView(this._buffer);
      this._fields = fieldInfos;
      new Uint8Array(this._buffer).fill(0);
      if (init) {
        for (const key of Object.keys(init)) {
          if (key in this) (this as any)[key] = (init as any)[key];
        }
      }
    }

    get ptr(): Pointer {
      return new Pointer({ __buf: this._buffer, __ptr: 0n, __size: totalSize });
    }

    toPointer(): Pointer {
      const native = _allocNative ? _allocNative(totalSize) : null;
      if (native && native.__buf) {
        const dst = new Uint8Array(native.__buf);
        dst.set(new Uint8Array(this._buffer));
        return new Pointer(native);
      }
      return this.ptr;
    }
  }

  for (const fi of fieldInfos) {
    const { name, offset, type, size } = fi;
    Object.defineProperty(StructInstance.prototype, name, {
      get(this: StructInstance) { return readValue(this._view, offset, type, size); },
      set(this: StructInstance, v: any) { writeValue(this._view, offset, type, size, v); },
      enumerable: true,
      configurable: false,
    });
  }

  (StructInstance.prototype as any).__senri_type = 'struct';
  (StructInstance as any).fields = fields;
  (StructInstance as any).packed = packed;

  return StructInstance as unknown as StructClass;
}

function readValue(view: DataView, offset: number, type: any, _size: number): any {
  if (typeof type === 'string') {
    switch (type) {
      case 'int8':    return view.getInt8(offset);
      case 'uint8':   return view.getUint8(offset);
      case 'int16':   return view.getInt16(offset, true);
      case 'uint16':  return view.getUint16(offset, true);
      case 'int32':   return view.getInt32(offset, true);
      case 'uint32':  return view.getUint32(offset, true);
      case 'int64':   return view.getBigInt64(offset, true);
      case 'uint64':  return view.getBigUint64(offset, true);
      case 'float32': return view.getFloat32(offset, true);
      case 'float64': return view.getFloat64(offset, true);
      case 'pointer': case 'cstring': return view.getBigUint64(offset, true);
      default: return 0;
    }
  }
  if (type && type.__senri_type === 'struct' && type.constructor) {
    const cls = type.constructor || type;
    const buf = view.buffer.slice(view.byteOffset + offset, view.byteOffset + offset + _size);
    return cls.fromPointer(new Pointer(buf));
  }
  return 0;
}

function writeValue(view: DataView, offset: number, type: any, _size: number, value: any): void {
  if (typeof type === 'string') {
    switch (type) {
      case 'int8':    view.setInt8(offset, value); break;
      case 'uint8':   view.setUint8(offset, value); break;
      case 'int16':   view.setInt16(offset, value, true); break;
      case 'uint16':  view.setUint16(offset, value, true); break;
      case 'int32':   view.setInt32(offset, value, true); break;
      case 'uint32':  view.setUint32(offset, value, true); break;
      case 'int64':   view.setBigInt64(offset, BigInt(value), true); break;
      case 'uint64':  view.setBigUint64(offset, BigInt(value), true); break;
      case 'float32': view.setFloat32(offset, value, true); break;
      case 'float64': view.setFloat64(offset, value, true); break;
      case 'pointer': case 'cstring': view.setBigUint64(offset, BigInt(value), true); break;
    }
  }
}

export function struct(fields: Record<string, any>, options?: { packed?: number }): StructClass {
  return createStruct(fields, options);
}
