# senri_ffi / SenRi FFI / 千里 FFI / せんり FFI

[中文](#中文) | [English](#english) 

---

# 中文

统一 FFI（外部函数接口）库，适用于 [KossJS Runtime](https://github.com/KossJS)、Node.js 和 Bun — 一套 API 到处调用原生 C 库。

## 特性

- **一次编写，到处运行** — 同一套 FFI 代码可在 KossJS、Node.js 和 Bun 上运行
- **自动检测** — 运行时自动选择正确的原生 FFI 后端
- **零原生依赖** — 在 KossJS 和 Bun 上使用内置 FFI；Node.js 上可选安装 `koffi`
- **完整类型系统** — 统一的 C 类型名称（`int32`、`float64`、`cstring` 等），各运行时自动映射
- **结构体支持** — 定义 C 结构体，自动处理布局、对齐和紧凑排列
- **指针 API** — 从原始内存中读写基本类型、指针和 C 字符串
- **回调函数** — 将 JavaScript 函数封装为 C 函数指针
- **内存管理** — `alloc`、`free`、`addressOf`、`errno`、`strerror`

## 安装

```bash
npm install senri_ffi
```

在 Node.js 上还需要安装 `koffi`：

```bash
npm install koffi
```

## 快速开始

```ts
import { Library, types } from 'senri_ffi';

// 加载原生库
const lib = Library.load(
  process.platform === 'win32' ? 'user32.dll' : 'libm.so.6'
);

// 调用 C 函数
const abs = lib.func('abs', types.int32, [types.int32]);
console.log(abs(-42)); // 42

// 别忘了关闭
lib.close();
```

## API

### `Library`

```ts
import { Library } from 'senri_ffi';
```

| 方法 | 说明 |
|--------|-------------|
| `Library.load(path: string): Library` | 加载原生共享库 |
| `lib.func(name, retType, argTypes[], options?): Function` | 绑定 C 函数（带缓存） |
| `lib.close(): void` | 关闭库并释放资源 |

### `types`

内置的统一类型常量：

```ts
import { types } from 'senri_ffi';

types.void      types.int8      types.uint8
types.int16     types.uint16    types.int32
types.uint32    types.int64     types.uint64
types.float32   types.float64   types.pointer
types.cstring
```

### `pointer(type?)` / `array(type, length)`

创建复合类型描述符：

```ts
import { pointer, array } from 'senri_ffi';

pointer(types.int32);       // 指向 int32 的指针
array(types.uint8, 256);    // uint8[256]
```

### `struct(fields, options?)`

定义 C 结构体类型：

```ts
import { struct, types } from 'senri_ffi';

const Point = struct({ x: types.float64, y: types.float64 });
const Rect = struct({ topLeft: Point, width: types.float64, height: types.float64 });

const p = new Point({ x: 10.5, y: 20.3 });
console.log(p.x, p.y);     // 10.5 20.3
console.log(Point.sizeof); // 16

// 紧凑排列结构体
const Packed = struct({ a: types.int8, b: types.int32 }, { packed: 1 });
console.log(Packed.sizeof); // 5
```

结构体实例具有 `.ptr` / `.toPointer()`，并支持 `.fromPointer(ptr)` 从原始内存中读取。

### `Pointer`

通过 `alloc()`、`addressOf()`、`callback()` 或 `new Pointer()` 创建：

```ts
import { alloc, Pointer } from 'senri_ffi';

const ptr = alloc(64);
ptr.writeInt32(0, 42);
ptr.writeCString(4, 'hello');

console.log(ptr.readInt32(0));   // 42
console.log(ptr.readCString(4)); // "hello"
console.log(ptr.address);        // 原始指针地址
```

| 读/写方法 | 类型 |
|--------------------|-------|
| `readInt8` / `writeInt8` | `int8` |
| `readUint8` / `writeUint8` | `uint8` |
| `readInt16` / `writeInt16` | `int16` |
| `readUint16` / `writeUint16` | `uint16` |
| `readInt32` / `writeInt32` | `int32` |
| `readUint32` / `writeUint32` | `uint32` |
| `readInt64` / `writeInt64` | `int64` (BigInt) |
| `readUint64` / `writeUint64` | `uint64` (BigInt) |
| `readFloat32` / `writeFloat32` | `float32` |
| `readFloat64` / `writeFloat64` | `float64` |
| `readPointer` / `writePointer` | `pointer` |
| `readCString` / `writeCString` | C 字符串 |

### `alloc(size)` / `free(ptr)` / `addressOf(buffer)`

```ts
import { alloc, free, addressOf } from 'senri_ffi';

const buf = new ArrayBuffer(16);
const ptr = addressOf(buf);

const mem = alloc(128);
free(mem);
```

### `callback(retType, argTypes, fn, options?)`

将 JavaScript 函数封装为 C 回调指针：

```ts
import { callback, types } from 'senri_ffi';

const cb = callback(
  types.int32,
  [types.int32, types.int32],
  (a, b) => a + b
);
// cb 是一个 Pointer，可以传给 C 函数
```

回调函数通过 `FinalizationRegistry` 在垃圾回收时自动释放。

### `errno()` / `strerror(code?)`

```ts
import { errno, strerror } from 'senri_ffi';

const code = errno();
console.log(strerror(code));
```

## 运行时检测

库按以下优先级自动检测运行时：

1. **KossJS** — 如果 `globalThis._senri_ffi` 为真值
2. **Bun** — 如果 `Bun.ffi` 可用
3. **Node.js** — 如果 `process.versions.node` 存在

## 运行要求

| 运行时 | 版本 | 说明 |
|---------|---------|-------|
| KossJS | — | 内置 FFI，通过 `_senri_ffi` |
| Bun | >= 1.0 | 内置 FFI，通过 `Bun.ffi` |
| Node.js | >= 18 | 需要单独安装 `koffi` |

## 许可证

[Apache-2.0](LICENSE)

---

# English

Unified FFI (Foreign Function Interface) library for [KossJS Runtime](https://github.com/KossJS), Node.js Runtime, and Bun Runtime — one API to call native C libraries everywhere.

## Features

- **Write once, run everywhere** — same FFI code works across KossJS, Node.js, and Bun
- **Auto-detection** — automatically picks the right native FFI backend at runtime
- **Zero native dependencies** — uses built-in FFI on KossJS and Bun; optionally `koffi` on Node.js
- **Full type system** — unified C type names (`int32`, `float64`, `cstring`, etc.) with automatic per-runtime mapping
- **Struct support** — define C structs with automatic layout, alignment, and packing
- **Pointer API** — read/write primitive values, pointers, and C strings from raw memory
- **Callbacks** — wrap JavaScript functions as C function pointers
- **Memory management** — `alloc`, `free`, `addressOf`, `errno`, `strerror`

## Installation

```bash
npm install senri_ffi
```

On Node.js, you also need `koffi`:

```bash
npm install koffi
```

## Quick Start

```ts
import { Library, types } from 'senri_ffi';

// Load a native library
const lib = Library.load(
  process.platform === 'win32' ? 'user32.dll' : 'libm.so.6'
);

// Call a C function
const abs = lib.func('abs', types.int32, [types.int32]);
console.log(abs(-42)); // 42

// Don't forget to close
lib.close();
```

## API

### `Library`

```ts
import { Library } from 'senri_ffi';
```

| Method | Description |
|--------|-------------|
| `Library.load(path: string): Library` | Load a native shared library |
| `lib.func(name, retType, argTypes[], options?): Function` | Bind a C function (cached) |
| `lib.close(): void` | Close the library and release resources |

### `types`

Built-in unified type constants:

```ts
import { types } from 'senri_ffi';

types.void      types.int8      types.uint8
types.int16     types.uint16    types.int32
types.uint32    types.int64     types.uint64
types.float32   types.float64   types.pointer
types.cstring
```

### `pointer(type?)` / `array(type, length)`

Create composite type descriptors:

```ts
import { pointer, array } from 'senri_ffi';

pointer(types.int32);       // pointer to int32
array(types.uint8, 256);    // uint8[256]
```

### `struct(fields, options?)`

Define a C struct type:

```ts
import { struct, types } from 'senri_ffi';

const Point = struct({ x: types.float64, y: types.float64 });
const Rect = struct({ topLeft: Point, width: types.float64, height: types.float64 });

const p = new Point({ x: 10.5, y: 20.3 });
console.log(p.x, p.y);     // 10.5 20.3
console.log(Point.sizeof); // 16

// Packed struct
const Packed = struct({ a: types.int8, b: types.int32 }, { packed: 1 });
console.log(Packed.sizeof); // 5
```

Struct instances have `.ptr` / `.toPointer()` and support `.fromPointer(ptr)` for reading from raw memory.

### `Pointer`

Created via `alloc()`, `addressOf()`, `callback()`, or `new Pointer()`:

```ts
import { alloc, Pointer } from 'senri_ffi';

const ptr = alloc(64);
ptr.writeInt32(0, 42);
ptr.writeCString(4, 'hello');

console.log(ptr.readInt32(0));   // 42
console.log(ptr.readCString(4)); // "hello"
console.log(ptr.address);        // raw pointer address
```

| Read/Write methods | Types |
|--------------------|-------|
| `readInt8` / `writeInt8` | `int8` |
| `readUint8` / `writeUint8` | `uint8` |
| `readInt16` / `writeInt16` | `int16` |
| `readUint16` / `writeUint16` | `uint16` |
| `readInt32` / `writeInt32` | `int32` |
| `readUint32` / `writeUint32` | `uint32` |
| `readInt64` / `writeInt64` | `int64` (BigInt) |
| `readUint64` / `writeUint64` | `uint64` (BigInt) |
| `readFloat32` / `writeFloat32` | `float32` |
| `readFloat64` / `writeFloat64` | `float64` |
| `readPointer` / `writePointer` | `pointer` |
| `readCString` / `writeCString` | C string |

### `alloc(size)` / `free(ptr)` / `addressOf(buffer)`

```ts
import { alloc, free, addressOf } from 'senri_ffi';

const buf = new ArrayBuffer(16);
const ptr = addressOf(buf);

const mem = alloc(128);
free(mem);
```

### `callback(retType, argTypes, fn, options?)`

Wrap a JavaScript function as a C callback pointer:

```ts
import { callback, types } from 'senri_ffi';

const cb = callback(
  types.int32,
  [types.int32, types.int32],
  (a, b) => a + b
);
// cb is a Pointer you can pass to a C function
```

Callbacks are automatically released via `FinalizationRegistry` when garbage collected.

### `errno()` / `strerror(code?)`

```ts
import { errno, strerror } from 'senri_ffi';

const code = errno();
console.log(strerror(code));
```

## Runtime Detection

The library auto-detects the runtime in this order:

1. **KossJS** — if `globalThis._senri_ffi` is truthy
2. **Bun** — if `Bun.ffi` is available
3. **Node.js** — if `process.versions.node` is present

## Requirements

| Runtime | Version | Notes |
|---------|---------|-------|
| KossJS | — | Built-in FFI via `_senri_ffi` |
| Bun | >= 1.0 | Built-in FFI via `Bun.ffi` |
| Node.js | >= 18 | Requires `koffi` (install separately) |

## License

[Apache-2.0](LICENSE)
