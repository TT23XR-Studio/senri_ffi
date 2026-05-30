export abstract class BaseAdapter {
  mapType(unifiedType: any): any { throw new Error('Not implemented'); }
  createLibrary(path: string): any { throw new Error('Not implemented'); }
  closeLibrary(handle: any): void { throw new Error('Not implemented'); }
  bindFunction(libHandle: any, name: string, retType: any, argTypes: any[], options?: any): any { throw new Error('Not implemented'); }
  createStructType(fields: Record<string, any>, packed?: number, size?: number, align?: number): any { throw new Error('Not implemented'); }
  createPointerType(innerType: any): any { throw new Error('Not implemented'); }
  createArrayType(innerType: any, length: number): any { throw new Error('Not implemented'); }
  allocMemory(size: number): any { throw new Error('Not implemented'); }
  freeMemory(ptr: any): void { throw new Error('Not implemented'); }
  getAddressOf(buffer: any): any { throw new Error('Not implemented'); }
  createCallback(retType: any, argTypes: any[], jsFn: Function, options?: any): any { throw new Error('Not implemented'); }
  releaseCallback(ptr: any): void { throw new Error('Not implemented'); }
  getErrno(): number { throw new Error('Not implemented'); }
  getStrerror(errno: number): string { throw new Error('Not implemented'); }
}
