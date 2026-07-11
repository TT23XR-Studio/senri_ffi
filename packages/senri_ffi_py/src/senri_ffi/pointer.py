from __future__ import annotations

import struct as _struct
from typing import Any

from senri_ffi.errors import FFIError

PTR_BRAND = "__senri_ptr__"

PointerData = dict[str, Any]

_READERS: dict[str, Any] = {
    "int8": lambda b, o: _struct.unpack_from("<b", b, o)[0],
    "uint8": lambda b, o: _struct.unpack_from("<B", b, o)[0],
    "int16": lambda b, o: _struct.unpack_from("<h", b, o)[0],
    "uint16": lambda b, o: _struct.unpack_from("<H", b, o)[0],
    "int32": lambda b, o: _struct.unpack_from("<i", b, o)[0],
    "uint32": lambda b, o: _struct.unpack_from("<I", b, o)[0],
    "int64": lambda b, o: _struct.unpack_from("<q", b, o)[0],
    "uint64": lambda b, o: _struct.unpack_from("<Q", b, o)[0],
    "float32": lambda b, o: _struct.unpack_from("<f", b, o)[0],
    "float64": lambda b, o: _struct.unpack_from("<d", b, o)[0],
}

_WRITERS: dict[str, Any] = {
    "int8": lambda b, o, v: _struct.pack_into("<b", b, o, v),
    "uint8": lambda b, o, v: _struct.pack_into("<B", b, o, v),
    "int16": lambda b, o, v: _struct.pack_into("<h", b, o, v),
    "uint16": lambda b, o, v: _struct.pack_into("<H", b, o, v),
    "int32": lambda b, o, v: _struct.pack_into("<i", b, o, v),
    "uint32": lambda b, o, v: _struct.pack_into("<I", b, o, v),
    "int64": lambda b, o, v: _struct.pack_into("<q", b, o, v),
    "uint64": lambda b, o, v: _struct.pack_into("<Q", b, o, v),
    "float32": lambda b, o, v: _struct.pack_into("<f", b, o, v),
    "float64": lambda b, o, v: _struct.pack_into("<d", b, o, v),
}


def _is_pointer_like(obj: Any) -> bool:
    return isinstance(obj, dict) and (obj.get(PTR_BRAND) is True or "__ptr" in obj)


def make_pointer(underlying: Any, size: int = 0) -> PointerData:
    if _is_pointer_like(underlying):
        return {
            "__ptr": int(underlying["__ptr"]),
            "__buf": underlying.get("__buf"),
            "__size": underlying.get("__size", 0),
        }
    if isinstance(underlying, (bytes, bytearray, memoryview)):
        buf = underlying
        return {"__ptr": 0, "__buf": buf, "__size": len(buf), PTR_BRAND: True}
    if isinstance(underlying, int):
        return {"__ptr": underlying, "__size": size, PTR_BRAND: True}
    addr = int(underlying) if underlying else 0
    return {"__ptr": addr, "__size": size, PTR_BRAND: True}


def _get_data_view(ptr: PointerData) -> Any:
    buf = ptr.get("__buf")
    if buf is None:
        return None
    if isinstance(buf, bytearray):
        return buf
    if isinstance(buf, (bytes, memoryview)):
        return bytearray(buf) if isinstance(buf, bytes) else buf
    if hasattr(buf, "_type_") and hasattr(buf, "_length_"):
        return buf
    return None


class Pointer:
    _data: PointerData

    def __init__(self, underlying: Any = None) -> None:
        if _is_pointer_like(underlying):
            self._data = underlying
        else:
            self._data = make_pointer(underlying)

    def _read(self, type_name: str, offset: int = 0) -> Any:
        buf = _get_data_view(self._data)
        if buf is not None:
            reader = _READERS.get(type_name)
            if reader:
                return reader(buf, offset)
        raise FFIError("Cannot read from this pointer: no backing buffer")

    def _write(self, type_name: str, offset: int, value: Any) -> None:
        buf = _get_data_view(self._data)
        if buf is not None:
            writer = _WRITERS.get(type_name)
            if writer:
                writer(buf, offset, value)
                return
        raise FFIError("Cannot write to this pointer: no backing buffer")

    def read_int8(self, offset: int = 0) -> int:
        return self._read("int8", offset)

    def write_int8(self, offset: int, v: int) -> None:
        self._write("int8", offset, v)

    def read_uint8(self, offset: int = 0) -> int:
        return self._read("uint8", offset)

    def write_uint8(self, offset: int, v: int) -> None:
        self._write("uint8", offset, v)

    def read_int16(self, offset: int = 0) -> int:
        return self._read("int16", offset)

    def write_int16(self, offset: int, v: int) -> None:
        self._write("int16", offset, v)

    def read_uint16(self, offset: int = 0) -> int:
        return self._read("uint16", offset)

    def write_uint16(self, offset: int, v: int) -> None:
        self._write("uint16", offset, v)

    def read_int32(self, offset: int = 0) -> int:
        return self._read("int32", offset)

    def write_int32(self, offset: int, v: int) -> None:
        self._write("int32", offset, v)

    def read_uint32(self, offset: int = 0) -> int:
        return self._read("uint32", offset)

    def write_uint32(self, offset: int, v: int) -> None:
        self._write("uint32", offset, v)

    def read_int64(self, offset: int = 0) -> int:
        return self._read("int64", offset)

    def write_int64(self, offset: int, v: int) -> None:
        self._write("int64", offset, v)

    def read_uint64(self, offset: int = 0) -> int:
        return self._read("uint64", offset)

    def write_uint64(self, offset: int, v: int) -> None:
        self._write("uint64", offset, v)

    def read_float32(self, offset: int = 0) -> float:
        return self._read("float32", offset)

    def write_float32(self, offset: int, v: float) -> None:
        self._write("float32", offset, v)

    def read_float64(self, offset: int = 0) -> float:
        return self._read("float64", offset)

    def write_float64(self, offset: int, v: float) -> None:
        self._write("float64", offset, v)

    def read_pointer(self, offset: int = 0) -> Pointer:
        addr = self._read("uint64", offset)
        return Pointer({"__ptr": addr, "__size": 0})

    def write_pointer(self, offset: int, ptr: Pointer | int) -> None:
        if isinstance(ptr, Pointer):
            addr = ptr._data["__ptr"]
        else:
            addr = int(ptr)
        self._write("uint64", offset, addr)

    def read_cstring(self, offset: int = 0) -> str:
        buf = _get_data_view(self._data)
        if buf is not None:
            end = offset
            while end < len(buf) and buf[end] != 0:
                end += 1
            return bytes(buf[offset:end]).decode("utf-8", errors="replace")
        return ""

    def write_cstring(self, offset: int, s: str) -> None:
        buf = _get_data_view(self._data)
        if buf is not None:
            encoded = s.encode("utf-8") + b"\x00"
            for i, byte in enumerate(encoded):
                buf[offset + i] = byte

    def add(self, offset: int) -> Pointer:
        new_addr = (self._data.get("__ptr") or 0) + offset
        new_buf = self._data.get("__buf")
        if new_buf is not None and isinstance(new_buf, bytearray):
            new_buf = new_buf[offset:]
        elif new_buf is not None and hasattr(new_buf, "_type_") and hasattr(new_buf, "_length_"):
            # ctypes array: use memoryview to create offset view
            mv = memoryview(new_buf)
            new_buf = mv[offset:]
        return Pointer({
            "__ptr": new_addr,
            "__buf": new_buf,
            "__size": max(0, (self._data.get("__size") or 0) - offset),
        })

    def to_int(self) -> int:
        return int(self._data.get("__ptr") or 0)

    @property
    def address(self) -> int:
        return int(self._data.get("__ptr") or 0)

    def is_null(self) -> bool:
        return self.address == 0
