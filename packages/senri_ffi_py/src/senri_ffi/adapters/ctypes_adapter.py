from __future__ import annotations

import ctypes
import platform
import sys
from typing import Any

from senri_ffi.errors import FFIError
from senri_ffi.types.adapter import FFIAdapter
from senri_ffi.types.normalized import (
    NormalizedType,
    serialize_type,
)

_CTYPES_MAP: dict[str, Any] = {
    "void": None,
    "int8": ctypes.c_int8,
    "uint8": ctypes.c_uint8,
    "int16": ctypes.c_int16,
    "uint16": ctypes.c_uint16,
    "int32": ctypes.c_int32,
    "uint32": ctypes.c_uint32,
    "int64": ctypes.c_int64,
    "uint64": ctypes.c_uint64,
    "float32": ctypes.c_float,
    "float64": ctypes.c_double,
    "pointer": ctypes.c_void_p,
    "cstring": ctypes.c_char_p,
}


def _map_type_rec(t: NormalizedType) -> Any:
    if t.kind == "primitive":
        assert t.name is not None
        mapped = _CTYPES_MAP.get(t.name)
        if mapped is None:
            raise FFIError(f"Unknown type: {t.name}")
        return mapped
    if t.kind == "pointer":
        assert t.of is not None
        inner = _map_type_rec(t.of)
        return ctypes.POINTER(inner)
    if t.kind == "array":
        assert t.of is not None
        inner = _map_type_rec(t.of)
        return inner * t.length
    if t.kind == "struct":
        assert t.fields is not None
        fields_list = []
        for name, ft in t.fields.items():
            fields_list.append((name, _map_type_rec(ft)))
        packed = t.packed
        if packed:
            class PackedStruct(ctypes.Structure):
                _pack_ = packed
                _fields_ = fields_list
            return PackedStruct
        else:
            class NormalStruct(ctypes.Structure):
                _fields_ = fields_list
            return NormalStruct
    raise FFIError(f"Cannot map type: {t}")


class CtypesAdapter(FFIAdapter):
    def __init__(self) -> None:
        self._libs: dict[Any, Any] = {}
        self._type_cache: dict[str, Any] = {}
        self._buffers: list[Any] = []
        self._callbacks: list[Any] = []

    def _get_or_create_type(self, t: NormalizedType) -> Any:
        key = serialize_type(t)
        cached = self._type_cache.get(key)
        if cached is not None:
            return cached
        mapped = _map_type_rec(t)
        self._type_cache[key] = mapped
        return mapped

    def load_library(self, path: str) -> Any:
        try:
            if platform.system() == "Windows":
                lib = ctypes.WinDLL(path)
            else:
                lib = ctypes.CDLL(path)
            self._libs[lib] = lib
            return lib
        except OSError as e:
            raise FFIError(f'Failed to load library "{path}": {e}') from e

    def close_library(self, lib_handle: Any) -> None:
        if lib_handle:
            if hasattr(lib_handle, "_handle") and lib_handle._handle:
                if platform.system() == "Windows":
                    ctypes.windll.kernel32.FreeLibrary.argtypes = [ctypes.c_void_p]
                    ctypes.windll.kernel32.FreeLibrary(lib_handle._handle)
            self._libs.pop(lib_handle, None)

    def bind_function(
        self,
        lib_handle: Any,
        name: str,
        ret_type: NormalizedType,
        arg_types: list[NormalizedType],
        options: Any = None,
    ) -> Any:
        try:
            func = getattr(lib_handle, name)
        except AttributeError:
            raise FFIError(f'Failed to bind function "{name}": symbol not found') from None

        native_ret = self._get_or_create_type(ret_type) if ret_type.name != "void" else None
        native_args = [self._get_or_create_type(t) for t in arg_types]

        if native_ret is not None:
            func.restype = native_ret
        func.argtypes = native_args

        return func

    def alloc(self, size: int) -> Any:
        buf = (ctypes.c_uint8 * size)()
        addr = ctypes.addressof(buf)
        self._buffers.append(buf)
        return {
            "__ptr": addr,
            "__buf": buf,
            "__size": size,
            "__senri_ptr__": True,
        }

    def free(self, ptr: Any) -> None:
        pass

    def address_of(self, buffer: Any) -> int:
        if isinstance(buffer, (bytes, bytearray, memoryview)):
            if isinstance(buffer, memoryview):
                return ctypes.addressof(ctypes.c_char.from_buffer(buffer))
            return ctypes.addressof(ctypes.c_char.from_buffer(buffer))
        if isinstance(buffer, ctypes.Array):
            return ctypes.addressof(buffer)
        raise FFIError("address_of requires bytes, bytearray, or memoryview")

    def register_callback(
        self,
        func: Any,
        ret_type: NormalizedType,
        arg_types: list[NormalizedType],
    ) -> Any:
        native_ret = self._get_or_create_type(ret_type) if ret_type.name != "void" else None
        native_args = [self._get_or_create_type(t) for t in arg_types]

        cb_type = ctypes.CFUNCTYPE(native_ret, *native_args) if native_ret else ctypes.CFUNCTYPE(None, *native_args)
        cb = cb_type(func)
        ptr = ctypes.cast(cb, ctypes.c_void_p).value
        return {
            "__ptr": ptr,
            "__cb": cb,
            "__size": 0,
        }

    def unregister_callback(self, ptr: Any) -> None:
        pass

    def get_errno(self) -> int:
        return ctypes.get_errno()

    def get_strerror(self, errno: int) -> str:
        try:
            import ctypes.util
            lib_name = "msvcrt.dll" if platform.system() == "Windows" else None
            if lib_name:
                lib = ctypes.WinDLL(lib_name)
            else:
                lib = ctypes.CDLL(ctypes.util.find_library("c") or "libc.so.6")
            strerror_fn = lib.strerror
            strerror_fn.restype = ctypes.c_char_p
            strerror_fn.argtypes = [ctypes.c_int]
            return strerror_fn(errno).decode("utf-8", errors="replace")
        except Exception:
            return f"Error code: {errno}"

    def map_type(self, t: NormalizedType) -> Any:
        return serialize_type(t)

    def create_pointer_type(self, of_type: NormalizedType) -> Any:
        ptr_t: NormalizedType = NormalizedType(kind="pointer", of=of_type)
        return serialize_type(ptr_t)

    def create_array_type(self, of_type: NormalizedType, length: int) -> Any:
        arr_t: NormalizedType = NormalizedType(kind="array", of=of_type, length=length)
        return serialize_type(arr_t)

    def create_struct_type(
        self,
        fields: dict[str, NormalizedType],
        packed: int | None = None,
        size: int = 0,
        align: int = 1,
    ) -> Any:
        st_t: NormalizedType = NormalizedType(
            kind="struct",
            fields=fields,
            packed=packed,
            size=size,
            align=align,
        )
        return serialize_type(st_t)
