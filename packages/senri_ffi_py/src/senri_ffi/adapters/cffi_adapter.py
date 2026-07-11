from __future__ import annotations

import platform
from typing import Any

from senri_ffi.errors import FFIError
from senri_ffi.types.adapter import FFIAdapter
from senri_ffi.types.normalized import (
    NormalizedType,
    serialize_type,
)


class _LibHandle:
    _path: str | None = None


_CFFI_PRIMITIVE_MAP: dict[str, str] = {
    "void": "void",
    "int8": "int8_t",
    "uint8": "uint8_t",
    "int16": "int16_t",
    "uint16": "uint16_t",
    "int32": "int32_t",
    "uint32": "uint32_t",
    "int64": "int64_t",
    "uint64": "uint64_t",
    "float32": "float",
    "float64": "double",
    "pointer": "void*",
    "cstring": "char*",
}


def _to_cffi_type(t: NormalizedType, tag: str | None = None) -> str:
    if t.kind == "primitive":
        assert t.name is not None
        mapped = _CFFI_PRIMITIVE_MAP.get(t.name)
        if mapped is None:
            raise FFIError(f"Unknown type: {t.name}")
        return mapped
    if t.kind == "pointer":
        assert t.of is not None
        return _to_cffi_type(t.of) + "*"
    if t.kind == "array":
        assert t.of is not None
        return _to_cffi_type(t.of) + f"[{t.length}]"
    if t.kind == "struct":
        assert t.fields is not None
        parts = []
        for name, ft in t.fields.items():
            parts.append(f"{_to_cffi_type(ft)} {name};")
        body = " ".join(parts)
        if tag is None:
            return f"struct {{ {body} }}"
        return f"struct {tag}"
    raise FFIError(f"Cannot convert type: {t}")


def _struct_decl(t: NormalizedType, tag: str) -> str:
    assert t.fields is not None
    parts = []
    for name, ft in t.fields.items():
        parts.append(f"{_to_cffi_type(ft)} {name};")
    body = " ".join(parts)
    return f"struct {tag} {{ {body} }};"


class CffiAdapter(FFIAdapter):
    def __init__(self) -> None:
        import cffi as _cffi
        self._ffi = _cffi.FFI()
        self._libs: dict[str, Any] = {}
        self._lib_paths: dict[int, str] = {}
        self._callbacks: list[Any] = []
        self._type_cache: dict[str, str] = {}
        self._func_cdefs: dict[str, str] = {}
        self._cdef_done: set[str] = set()
        self._struct_tags: dict[str, str] = {}

    def _get_cffi_type(self, t: NormalizedType) -> str:
        if t.kind == "struct":
            key = serialize_type(t)
            tag = self._struct_tags.get(key)
            if tag is None:
                tag = f"SenRiStruct{len(self._struct_tags)}"
                self._struct_tags[key] = tag
                decl = _struct_decl(t, tag)
                if decl not in self._cdef_done:
                    try:
                        self._ffi.cdef(decl)
                        self._cdef_done.add(decl)
                    except Exception as e:
                        raise FFIError(f"Failed to declare struct: {e}") from e
            return f"struct {tag}"
        key = serialize_type(t)
        cached = self._type_cache.get(key)
        if cached is not None:
            return cached
        ctype = _to_cffi_type(t)
        self._type_cache[key] = ctype
        return ctype

    def load_library(self, path: str) -> Any:
        self._lib_paths[id(path)] = path
        handle = _LibHandle()
        handle._path = path
        return handle

    def close_library(self, lib_handle: Any) -> None:
        pass

    def bind_function(
        self,
        lib_handle: Any,
        name: str,
        ret_type: NormalizedType,
        arg_types: list[NormalizedType],
        options: Any = None,
    ) -> Any:
        native_ret = self._get_cffi_type(ret_type)
        native_args = [self._get_cffi_type(t) for t in arg_types]
        cdef_str = f"{native_ret} {name}({', '.join(native_args)});"
        if cdef_str not in self._cdef_done:
            try:
                self._ffi.cdef(cdef_str)
                self._cdef_done.add(cdef_str)
            except Exception as e:
                raise FFIError(f'Failed to declare function "{name}": {e}') from e

        path = lib_handle._path
        lib = self._ffi.dlopen(path)
        try:
            func = getattr(lib, name)
        except AttributeError:
            raise FFIError(f'Failed to bind function "{name}": symbol not found') from None

        arg_kind_is_pointer = [
            (t.kind == "pointer" or (t.kind == "primitive" and t.name == "pointer"))
            for t in arg_types
        ]
        arg_kind_is_cstring = [
            t.name == "cstring" if t.kind == "primitive" else False
            for t in arg_types
        ]

        def _wrap(value: Any, is_ptr: bool, is_cstring: bool) -> Any:
            if is_ptr and isinstance(value, int):
                if value == 0:
                    return self._ffi.NULL
                return self._ffi.cast("void*", value)
            if is_cstring:
                if isinstance(value, str):
                    return value.encode("utf-8")
                if isinstance(value, bytes):
                    return value
            return value

        if any(arg_kind_is_pointer) or any(arg_kind_is_cstring):
            def wrapped(*args):
                if len(args) != len(arg_kind_is_pointer):
                    raise TypeError(
                        f"{name}() expected {len(arg_kind_is_pointer)} arguments, got {len(args)}"
                    )
                conv_args = tuple(
                    _wrap(a, arg_kind_is_pointer[i], arg_kind_is_cstring[i])
                    for i, a in enumerate(args)
                )
                return func(*conv_args)
            return wrapped
        return func

    def alloc(self, size: int) -> Any:
        buf = self._ffi.new(f"unsigned char[{size}]")
        addr = int(self._ffi.cast("uintptr_t", buf))
        return {
            "__ptr": addr,
            "__buf": buf,
            "__size": size,
            "__senri_ptr__": True,
        }

    def free(self, ptr: Any) -> None:
        pass

    def address_of(self, buffer: Any) -> int:
        if isinstance(buffer, (bytes, bytearray)):
            buf = self._ffi.from_buffer(buffer)
            return int(self._ffi.cast("uintptr_t", buf))
        cdata = getattr(buffer, "_cdata", buffer)
        return int(self._ffi.cast("uintptr_t", cdata))

    def register_callback(
        self,
        func: Any,
        ret_type: NormalizedType,
        arg_types: list[NormalizedType],
    ) -> Any:
        native_ret = self._get_cffi_type(ret_type)
        native_args = [self._get_cffi_type(t) for t in arg_types]

        cdecl = f"{native_ret} ({', '.join(native_args)})"
        cb = self._ffi.callback(cdecl, func)
        ptr = int(self._ffi.cast("uintptr_t", cb))
        self._callbacks.append(cb)
        return {
            "__ptr": ptr,
            "__cb": cb,
            "__size": 0,
        }

    def unregister_callback(self, ptr: Any) -> None:
        pass

    def get_errno(self) -> int:
        return self._ffi.errno

    def get_strerror(self, errno: int) -> str:
        return str(self._ffi.errno)

    def map_type(self, t: NormalizedType) -> Any:
        return serialize_type(t)

    def create_pointer_type(self, of_type: NormalizedType) -> Any:
        ptr_t = NormalizedType(kind="pointer", of=of_type)
        return serialize_type(ptr_t)

    def create_array_type(self, of_type: NormalizedType, length: int) -> Any:
        arr_t = NormalizedType(kind="array", of=of_type, length=length)
        return serialize_type(arr_t)

    def create_struct_type(
        self,
        fields: dict[str, NormalizedType],
        packed: int | None = None,
        size: int = 0,
        align: int = 1,
    ) -> Any:
        st_t = NormalizedType(
            kind="struct",
            fields=fields,
            packed=packed,
            size=size,
            align=align,
        )
        return serialize_type(st_t)
