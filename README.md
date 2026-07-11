# SenRi FFI / 千里 FFI / せんり FFI

统一 FFI（外部函数接口）库，提供跨语言的原生 C 函数调用能力。

## 包

| 包 | 语言 | 说明 |
|----|------|------|
| [`packages/senri_ffi_js`](./packages/senri_ffi_js) | JavaScript/TypeScript | 支持 KossJS、Node.js、Bun、Deno |
| [`packages/senri_ffi_py`](./packages/senri_ffi_py) | Python | 支持 `ctypes`（内置）和 `cffi`（可选）双后端 |

## 共同特性

- **统一类型系统** — 跨语言一致的 C 类型名称（`int32`、`float64`、`cstring` 等）
- **结构体支持** — 自动处理布局、对齐和紧凑排列
- **指针 API** — 从原生内存中读写基本类型和 C 字符串
- **回调函数** — 将宿主语言函数封装为 C 函数指针
- **内存管理** — `alloc`、`free`、`address_of`、`errno`、`strerror`

## 文档

> 文档请参阅 [SenRi FFI 文档](https://docss.sxxyrry.qzz.io/SenRiFFI/)

## 许可证

[Apache-2.0](LICENSE)
