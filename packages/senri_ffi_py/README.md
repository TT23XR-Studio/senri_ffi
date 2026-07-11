# senri_ffi / SenRi FFI / 千里 FFI / せんり FFI

统一 FFI（外部函数接口）Python 库 — 一套 API 调用原生 C 库，支持 `ctypes`（内置）和 `cffi`（可选）双后端。

## 特性

- **双后端自动检测** — 优先使用 `cffi`，不可用时自动降级为 `ctypes`
- **零强制依赖** — `ctypes` 为标准库内置；`cffi` 为可选安装
- **完整类型系统** — 统一的 C 类型名称（`int32`、`float64`、`cstring` 等），自动映射到原生类型
- **结构体支持** — 定义 C 结构体，自动处理布局、对齐和紧凑排列
- **指针 API** — `Pointer` 类封装原生内存，支持读写基本类型和 C 字符串
- **回调函数** — 将 Python 函数封装为 C 函数指针
- **内存管理** — `alloc`、`free`、`address_of`、`errno`、`strerror`
- **类型注解** — 完整的 `py.typed` 支持，开箱即用

## 安装

```bash
pip install senri-ffi
```

如需使用 `cffi` 后端：

```bash
pip install "senri-ffi[cffi]"
```

## 快速开始

```python
from senri_ffi import Library, types

# 加载原生库
lib = Library.load("user32.dll")  # Windows
# lib = Library.load("libm.so.6")  # Linux
# lib = Library.load("libm.dylib")  # macOS

# 调用 C 函数
abs_fn = lib.func("abs", types.int32, [types.int32])
print(abs_fn(-42))  # 42

# 别忘了关闭
lib.close()
```

## 结构体示例

```python
from senri_ffi import Library, types, struct

Point = struct({
    "x": types.int32,
    "y": types.int32,
})

lib = Library.load("mylib.so")
create_point = lib.func("create_point", types.pointer, [])
ptr = create_point()
p = Point.from_pointer(ptr)
print(p.x, p.y)
```

## 运行要求

| Python 版本 | 说明 |
|-------------|------|
| >= 3.13 | 必需 |

| 后端 | 安装方式 | 说明 |
|------|---------|------|
| `ctypes` | 内置（标准库） | 默认后端，无需额外安装 |
| `cffi` | `pip install "senri-ffi[cffi]"` | 优先使用的后端，性能更优 |

## 文档

> 文档请参阅 [SenRi FFI 文档](https://docss.sxxyrry.qzz.io/SenRiFFI/)

## 许可证

[Apache-2.0](LICENSE)
