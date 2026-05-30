import { getKoffi, getKoffiMap } from '../types/mapping';
import { FFIError } from '../errors';

export class NodeAdapter {
  private _koffi: any = null;
  private _typeMap: Record<string, any> | null = null;

  private ensureKoffi(): any {
    if (!this._koffi) {
      try { this._koffi = getKoffi(); } catch (e: any) {
        throw new FFIError('koffi is required for Node.js FFI. Install with: npm install koffi');
      }
      this._typeMap = getKoffiMap();
    }
    return this._koffi;
  }

  mapType(unifiedType: any): any {
    if (typeof unifiedType === 'string') {
      this.ensureKoffi();
      const mapped = this._typeMap![unifiedType];
      if (!mapped) throw new FFIError('Unknown type: ' + unifiedType);
      return mapped;
    }
    return unifiedType;
  }

  createLibrary(path: string): any {
    this.ensureKoffi();
    try { return this._koffi.load(path); }
    catch (e: any) { throw new FFIError('Failed to load library "' + path + '": ' + e.message); }
  }

  closeLibrary(_handle: any): void {
    // koffi manages library lifetime automatically
  }

  bindFunction(libHandle: any, name: string, retType: any, argTypes: any[], _options?: any): any {
    this.ensureKoffi();
    try { return libHandle.func(name, retType, argTypes); }
    catch (e: any) { throw new FFIError('Failed to bind function "' + name + '": ' + e.message); }
  }

  createStructType(fields: Record<string, any>, _packed?: number, _size?: number, _align?: number): any {
    this.ensureKoffi();
    if (this._koffi.struct) return this._koffi.struct(fields);
    return null;
  }

  createPointerType(innerType: any): any {
    this.ensureKoffi();
    return this._koffi.pointer ? this._koffi.pointer(innerType) : this._koffi.pointer;
  }

  createArrayType(innerType: any, length: number): any {
    this.ensureKoffi();
    return this._koffi.array ? this._koffi.array(innerType, length) : innerType;
  }

  allocMemory(size: number): any {
    this.ensureKoffi();
    const buf = Buffer.allocUnsafe(size);
    const addr = this._koffi.address ? this._koffi.address(buf) : buf;
    return { __ptr: addr, __buf: buf, __size: size };
  }

  freeMemory(ptr: any): void {
    if (ptr && ptr.__buf) ptr.__buf = null;
  }

  getAddressOf(buffer: any): any {
    this.ensureKoffi();
    const addr = this._koffi.address ? this._koffi.address(buffer) : buffer;
    return { __ptr: addr, __buf: buffer, __size: buffer.byteLength || buffer.length };
  }

  createCallback(retType: any, argTypes: any[], jsFn: Function, _options?: any): any {
    this.ensureKoffi();
    try {
      const cb = this._koffi.callback(retType, argTypes, jsFn);
      const ptr = this.getAddressOf(cb);
      ptr.__cb = cb;
      return ptr;
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
