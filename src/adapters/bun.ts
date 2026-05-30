import { BUN_MAP } from '../types/mapping';
import { FFIError } from '../errors';

declare var Bun: any;

export class BunAdapter {
  constructor() {
    if (typeof Bun === 'undefined' || !Bun.ffi) {
      throw new FFIError('Bun.ffi not available');
    }
  }

  mapType(unifiedType: any): any {
    if (typeof unifiedType === 'string') {
      const mapped = BUN_MAP[unifiedType];
      if (!mapped) throw new FFIError('Unknown type: ' + unifiedType);
      return mapped;
    }
    return unifiedType;
  }

  createLibrary(path: string): any {
    try {
      const lib = Bun.ffi.dlopen(path, {});
      return { __path: path, __lib: lib, __symbols: {} as Record<string, any> };
    } catch (e: any) {
      throw new FFIError('Failed to load library "' + path + '": ' + e.message);
    }
  }

  closeLibrary(handle: any): void {
    if (handle) { handle.__lib = null; handle.__symbols = null; }
  }

  bindFunction(libHandle: any, name: string, retType: any, argTypes: any[], _options?: any): any {
    if (!libHandle || !libHandle.__lib) throw new FFIError('Invalid or closed library handle');

    const key = name + '_' + JSON.stringify({ retType, argTypes });
    if (libHandle.__symbols[key]) return libHandle.__symbols[key];

    const dl = Bun.ffi.dlopen(libHandle.__path, {
      [name]: { returns: retType, args: argTypes },
    });
    const fn = dl.symbols ? dl.symbols[name] : dl[name];
    if (!fn) throw new FFIError('Symbol not found: ' + name);

    libHandle.__symbols[key] = fn;
    return fn;
  }

  createStructType(_fields: Record<string, any>, _packed?: number, _size?: number, _align?: number): any {
    return null;
  }

  createPointerType(_innerType: any): any { return 'ptr'; }
  createArrayType(innerType: any, _length: number): any { return innerType; }

  allocMemory(size: number): any {
    const buf = new ArrayBuffer(size);
    const u8 = new Uint8Array(buf);
    u8.fill(0);
    const ptr = Bun.ffi.ptr ? Bun.ffi.ptr(buf) : 0;
    return { __ptr: ptr, __buf: buf, __size: size, __u8: u8 };
  }

  freeMemory(ptr: any): void {
    if (ptr) { ptr.__buf = null; ptr.__u8 = null; }
  }

  getAddressOf(buffer: any): any {
    const ptr = Bun.ffi.ptr ? Bun.ffi.ptr(buffer) : 0;
    const size = buffer.byteLength || buffer.length || 0;
    return { __ptr: ptr, __buf: buffer, __size: size };
  }

  createCallback(retType: any, argTypes: any[], jsFn: Function, _options?: any): any {
    try {
      const cb = Bun.ffi.Callback({ returns: retType, arguments: argTypes }, jsFn);
      const ptr = typeof cb.ptr === 'bigint' ? Number(cb.ptr) : cb.ptr;
      return { __ptr: ptr || 0, __cb: cb, __size: 0 };
    } catch (e: any) {
      throw new FFIError('Failed to create callback: ' + e.message);
    }
  }

  releaseCallback(ptr: any): void {
    if (ptr && ptr.__cb) ptr.__cb = null;
  }

  getErrno(): number { return 0; }
  getStrerror(errno: number): string { return 'Error code: ' + errno; }
}
