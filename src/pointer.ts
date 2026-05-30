import { FFIError } from './errors';

const READERS: Record<string, (b: DataView, o: number) => any> = {
  int8:    (b, o) => b.getInt8(o),
  uint8:   (b, o) => b.getUint8(o),
  int16:   (b, o) => b.getInt16(o, true),
  uint16:  (b, o) => b.getUint16(o, true),
  int32:   (b, o) => b.getInt32(o, true),
  uint32:  (b, o) => b.getUint32(o, true),
  int64:   (b, o) => b.getBigInt64(o, true),
  uint64:  (b, o) => b.getBigUint64(o, true),
  float32: (b, o) => b.getFloat32(o, true),
  float64: (b, o) => b.getFloat64(o, true),
};

const WRITERS: Record<string, (b: DataView, o: number, v: any) => void> = {
  int8:    (b, o, v) => b.setInt8(o, v),
  uint8:   (b, o, v) => b.setUint8(o, v),
  int16:   (b, o, v) => b.setInt16(o, v, true),
  uint16:  (b, o, v) => b.setUint16(o, v, true),
  int32:   (b, o, v) => b.setInt32(o, v, true),
  uint32:  (b, o, v) => b.setUint32(o, v, true),
  int64:   (b, o, v) => b.setBigInt64(o, BigInt(v), true),
  uint64:  (b, o, v) => b.setBigUint64(o, BigInt(v), true),
  float32: (b, o, v) => b.setFloat32(o, v, true),
  float64: (b, o, v) => b.setFloat64(o, v, true),
};

function getDataView(ptr: any): DataView | null {
  if (ptr.__buf instanceof ArrayBuffer) return new DataView(ptr.__buf);
  if (ptr.__buf && ptr.__buf.buffer instanceof ArrayBuffer)
    return new DataView(ptr.__buf.buffer, ptr.__buf.byteOffset, ptr.__buf.byteLength);
  if (ptr.__u8) return new DataView(ptr.__u8.buffer);
  return null;
}

export function makePointer(underlying: any, size?: number): any {
  if (underlying && typeof underlying === 'object' && underlying.__ptr !== undefined)
    return underlying;
  if (underlying instanceof ArrayBuffer || ArrayBuffer.isView(underlying)) {
    const buf = ArrayBuffer.isView(underlying) ? underlying.buffer : underlying;
    return { __ptr: 0, __buf: buf, __size: buf.byteLength };
  }
  const addr = typeof underlying === 'bigint' ? Number(underlying) : underlying;
  return { __ptr: addr || 0, __size: size || 0 };
}

export class Pointer {
  _data: any;

  constructor(underlying?: any) {
    if (underlying && underlying.__ptr !== undefined) {
      this._data = underlying;
    } else {
      this._data = makePointer(underlying);
    }
  }

  private _read(type: string, offset: number = 0): any {
    const dv = getDataView(this._data);
    if (dv) { const reader = READERS[type]; if (reader) return reader(dv, offset); }
    throw new FFIError('Cannot read from this pointer: no backing buffer');
  }

  private _write(type: string, offset: number, value: any): void {
    const dv = getDataView(this._data);
    if (dv) { const writer = WRITERS[type]; if (writer) { writer(dv, offset, value); return; } }
    throw new FFIError('Cannot write to this pointer: no backing buffer');
  }

  readInt8(offset: number = 0): number     { return this._read('int8', offset); }
  writeInt8(offset: number, v: number): void { this._write('int8', offset, v); }
  readUint8(offset: number = 0): number    { return this._read('uint8', offset); }
  writeUint8(offset: number, v: number): void { this._write('uint8', offset, v); }
  readInt16(offset: number = 0): number    { return this._read('int16', offset); }
  writeInt16(offset: number, v: number): void { this._write('int16', offset, v); }
  readUint16(offset: number = 0): number   { return this._read('uint16', offset); }
  writeUint16(offset: number, v: number): void { this._write('uint16', offset, v); }
  readInt32(offset: number = 0): number    { return this._read('int32', offset); }
  writeInt32(offset: number, v: number): void { this._write('int32', offset, v); }
  readUint32(offset: number = 0): number   { return this._read('uint32', offset); }
  writeUint32(offset: number, v: number): void { this._write('uint32', offset, v); }
  readInt64(offset: number = 0): bigint    { return this._read('int64', offset); }
  writeInt64(offset: number, v: bigint): void { this._write('int64', offset, v); }
  readUint64(offset: number = 0): bigint   { return this._read('uint64', offset); }
  writeUint64(offset: number, v: bigint): void { this._write('uint64', offset, v); }
  readFloat32(offset: number = 0): number  { return this._read('float32', offset); }
  writeFloat32(offset: number, v: number): void { this._write('float32', offset, v); }
  readFloat64(offset: number = 0): number  { return this._read('float64', offset); }
  writeFloat64(offset: number, v: number): void { this._write('float64', offset, v); }

  readPointer(offset: number = 0): Pointer {
    const addr = this._read('uint64', offset);
    return new Pointer({ __ptr: Number(addr), __size: 0 });
  }

  writePointer(offset: number, ptr: Pointer | number): void {
    const addr = ptr instanceof Pointer ? ptr._data.__ptr : Number(ptr);
    this._write('uint64', offset, BigInt(addr));
  }

  readCString(offset: number = 0): string {
    const dv = getDataView(this._data);
    if (dv) {
      let end = offset;
      while (end < dv.byteLength && dv.getUint8(end) !== 0) end++;
      const len = end - offset;
      const arr = new Uint8Array(dv.buffer, dv.byteOffset + offset, len);
      return new TextDecoder().decode(arr);
    }
    return '';
  }

  writeCString(offset: number, str: string): void {
    const dv = getDataView(this._data);
    if (dv) {
      const enc = new TextEncoder().encode(str + '\0');
      for (let i = 0; i < enc.length; i++) dv.setUint8(offset + i, enc[i]);
    }
  }

  add(offset: number): Pointer {
    const newAddr = (this._data.__ptr || 0) + offset;
    return new Pointer({ __ptr: newAddr, __size: Math.max(0, (this._data.__size || 0) - offset) });
  }

  toBigInt(): bigint {
    return BigInt(this._data.__ptr || 0);
  }

  get address(): number {
    return this._data.__ptr || 0;
  }
}
