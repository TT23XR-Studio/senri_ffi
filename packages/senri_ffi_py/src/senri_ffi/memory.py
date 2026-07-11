from __future__ import annotations

from typing import Any

from senri_ffi.errors import FFIError
from senri_ffi.globals import get_global_adapter
from senri_ffi.pointer import Pointer
from senri_ffi.registry import get_resource_registry


def alloc(size: int) -> Pointer:
    if not isinstance(size, int) or size <= 0:
        raise FFIError("alloc requires a positive size")
    adapter = get_global_adapter()
    result = adapter.alloc(size)
    get_resource_registry().register_memory(result)
    return Pointer(result)


def free(ptr: Pointer | Any) -> None:
    adapter = get_global_adapter()
    data = ptr._data if isinstance(ptr, Pointer) else ptr
    get_resource_registry().unregister_memory(data)
    adapter.free(data)


def address_of(buffer: Any) -> Pointer:
    if buffer is None or not isinstance(buffer, (bytes, bytearray, memoryview)):
        raise FFIError("address_of requires bytes, bytearray, or memoryview")
    adapter = get_global_adapter()
    addr = adapter.address_of(buffer)
    return Pointer({
        "__ptr": addr,
        "__buf": buffer,
        "__size": len(buffer),
        "__senri_ptr__": True,
    })


def errno() -> int:
    try:
        return get_global_adapter().get_errno()
    except Exception:
        return 0


def strerror(code: int = 0) -> str:
    try:
        return get_global_adapter().get_strerror(code)
    except Exception:
        return ""
