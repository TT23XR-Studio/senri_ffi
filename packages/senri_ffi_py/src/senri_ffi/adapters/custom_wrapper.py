from __future__ import annotations

import os
import sys
from typing import Any

from senri_ffi.errors import FFIError
from senri_ffi.registry import get_resource_registry
from senri_ffi.types.adapter import FFIAdapter
from senri_ffi.types.normalized import NormalizedType, serialize_type


def _is_debug() -> bool:
    return os.environ.get("SENRI_FFI_DEBUG") == "true"


def _wrap_error(context: str, e: Exception) -> FFIError:
    if _is_debug():
        raise e
    msg = str(e)
    err = FFIError(f"{context}: {msg}")
    err.__cause__ = e
    return err


class CustomAdapterWrapper(FFIAdapter):
    _is_custom_backend = True

    def __init__(self, backend: Any) -> None:
        self._backend = backend
        if callable(getattr(backend, "init", None)):
            try:
                backend.init()
            except Exception as e:
                raise _wrap_error("Custom backend init failed", e) from e

    def get_backend(self) -> Any:
        return self._backend

    def cleanup(self) -> None:
        if callable(getattr(self._backend, "destroy", None)):
            try:
                self._backend.destroy()
            except Exception:
                pass

    def load_library(self, path: str) -> Any:
        try:
            return self._backend.open(path)
        except Exception as e:
            raise _wrap_error(f'Failed to load library "{path}"', e) from e

    def close_library(self, lib_handle: Any) -> None:
        try:
            self._backend.close(lib_handle)
        except Exception:
            pass

    def bind_function(
        self,
        lib_handle: Any,
        name: str,
        ret_type: NormalizedType,
        arg_types: list[NormalizedType],
        options: Any = None,
    ) -> Any:
        try:
            return self._backend.bind(lib_handle, name, ret_type, arg_types)
        except Exception as e:
            raise _wrap_error(f'Failed to bind function "{name}"', e) from e

    def alloc(self, size: int) -> Any:
        try:
            result = self._backend.alloc(size)
            get_resource_registry().register_memory(result)
            return result
        except Exception as e:
            raise _wrap_error(f"Failed to allocate {size} bytes", e) from e

    def free(self, ptr: Any) -> None:
        get_resource_registry().unregister_memory(ptr)
        try:
            self._backend.free(ptr)
        except Exception:
            pass

    def address_of(self, buffer: Any) -> int:
        try:
            return self._backend.address_of(buffer)
        except Exception as e:
            raise _wrap_error("Failed to get address of buffer", e) from e

    def register_callback(
        self,
        func: Any,
        ret_type: NormalizedType,
        arg_types: list[NormalizedType],
    ) -> Any:
        try:
            result = self._backend.register_callback(func, ret_type, arg_types)

            def _unregister():
                get_resource_registry().unregister_callback(result)
                self._backend.unregister_callback(result)

            result["_unregister"] = _unregister
            get_resource_registry().register_callback(result)
            return result
        except Exception as e:
            raise _wrap_error("Failed to register callback", e) from e

    def unregister_callback(self, ptr: Any) -> None:
        get_resource_registry().unregister_callback(ptr)
        try:
            self._backend.unregister_callback(ptr)
        except Exception:
            pass

    def get_errno(self) -> int:
        try:
            return self._backend.get_errno()
        except Exception:
            return 0

    def get_strerror(self, errno: int) -> str:
        try:
            return self._backend.get_strerror(errno)
        except Exception:
            return "Unknown error"

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
