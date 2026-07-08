# senri_ffi / SenRi FFI / 千里 FFI / せんり FFI

统一 FFI（外部函数接口）库，适用于 [KossJS Runtime](https://github.com/KossJS)、Node.js、Bun 和 Deno — 一套 API 到处调用原生 C 库。

## 特性

- **一次编写，到处运行** — 同一套 FFI 代码可在 KossJS、Node.js、Bun 和 Deno 上运行
- **自动检测** — 运行时自动选择正确的原生 FFI 后端
- **零原生依赖** — 在 KossJS、Bun 和 Deno 上使用内置 FFI；Node.js 上可选安装 `koffi`
- **完整类型系统** — 统一的 C 类型名称（`int32`、`float64`、`cstring` 等），各运行时自动映射
- **结构体支持** — 定义 C 结构体，自动处理布局、对齐和紧凑排列
- **指针 API** — 从原始内存中读写基本类型、指针和 C 字符串
- **回调函数** — 将 JavaScript 函数封装为 C 函数指针
- **内存管理** — `alloc`、`free`、`addressOf`、`errno`、`strerror`
- **异步调用** — Deno 和 KossJS 原生非阻塞、Node worker 线程、Bun Promise 包装

## 安装

```bash
npm install @tt23xrstudio/senri_ffi
```

在 Node.js 上还需要安装 `koffi`：

```bash
npm install koffi
```

## 快速开始

```ts
import { Library, types } from '@tt23xrstudio/senri_ffi';

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

## 文档

> 文档请参阅 [SenRi FFI 文档](https://docss.sxxyrry.qzz.io/SenRiFFI/)

## 运行要求

| 运行时 | 版本 | 说明 |
|---------|---------|-------|
| KossJS | >=0.1.0-dev.6 | 内置 FFI，通过 `_senri_ffi` |
| Bun | >= 1.0 | 内置 FFI，通过 `Bun.FFI`。**注意**`cstring` 类型存在已知崩溃问题；自动降级为 `ptr`（字符串参数转为 buffer，返回值返回原始指针地址）。 |
| Node.js | >= 20 | 需要单独安装 `koffi` |
| Deno | >= 2.8 | 内置 FFI，通过 `Deno.dlopen` |

## 许可证

[Apache-2.0](LICENSE)
