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

import { AsyncChannel } from './channel';
import { NormalizedType } from '../types/normalized';

declare var Deno: any;

export class DenoChannel implements AsyncChannel {
  private _lib: any = null;
  private _libPath: string = '';
  private _symbols: Map<string, any> = new Map();

  async init(libPath: string): Promise<void> {
    this._libPath = libPath;
    this._lib = Deno.dlopen(libPath, {});
  }

  async bind(name: string, _retType: NormalizedType, _argTypes: NormalizedType[]): Promise<void> {
  }

  async call(name: string, retType: NormalizedType, argTypes: NormalizedType[], args: any[]): Promise<any> {
    if (!this._lib) throw new Error('Library not loaded');

    const symbols = this._lib.symbols;
    if (!symbols[name]) {
      const def: any = {
        parameters: argTypes.map(() => 'pointer'),
        result: 'pointer',
      };
      def.nonblocking = true;
      const reopened = Deno.dlopen(this._libPath, { [name]: def });
      symbols[name] = reopened.symbols[name];
    }

    return symbols[name](...args);
  }

  async shutdown(): Promise<void> {
    if (this._lib && typeof this._lib.close === 'function') {
      this._lib.close();
    }
    this._lib = null;
    this._symbols.clear();
  }
}
