import { FFIError } from './errors';

let _adapter: any = null;

export function setLibraryAdapter(adapter: any): void {
  _adapter = adapter;
}

export class Library {
  private _handle: any;
  private _closed: boolean;
  private _funcCache: Map<string, Function>;

  private constructor(handle: any) {
    this._handle = handle;
    this._closed = false;
    this._funcCache = new Map();
  }

  static load(path: string): Library {
    if (!_adapter) throw new FFIError('Adapter not initialized');
    const handle = _adapter.createLibrary(path);
    return new Library(handle);
  }

  func(name: string, retType: any, argTypes: any[], options?: any): Function {
    if (this._closed) throw new FFIError('Library is closed');

    const cacheKey = name + '|' + JSON.stringify(retType) + '|' + JSON.stringify(argTypes);
    const cached = this._funcCache.get(cacheKey);
    if (cached) return cached;

    const bound = _adapter.bindFunction(this._handle, name, retType, argTypes, options);
    this._funcCache.set(cacheKey, bound);
    return bound;
  }

  close(): void {
    if (this._closed) return;
    _adapter.closeLibrary(this._handle);
    this._funcCache.clear();
    this._handle = null;
    this._closed = true;
  }
}
