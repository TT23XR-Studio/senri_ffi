from __future__ import annotations

import struct as _struct
from typing import Any, Callable

from senri_ffi.pointer import Pointer
from senri_ffi.types.normalized import (
    compute_normalized_layout,
    get_normalized_align,
    get_normalized_size,
    normalize_fields,
)
from senri_ffi.types.constants import TYPE_SIZES


class StructInstance:
    _buffer: bytearray
    _fields: list[dict[str, Any]]
    _struct_cls: Any

    def __init__(self, init: dict[str, Any] | None = None) -> None:
        self._buffer = bytearray(self._struct_cls._total_size)
        if init:
            for key, value in init.items():
                if hasattr(self, key):
                    setattr(self, key, value)

    @property
    def ptr(self) -> Pointer:
        return Pointer({"__buf": self._buffer, "__ptr": 0, "__size": self._struct_cls._total_size})

    def to_pointer(self) -> Pointer:
        alloc_native = getattr(self._struct_cls, "_alloc_native", None)
        if alloc_native:
            native = alloc_native(self._struct_cls._total_size)
            data = native._data if isinstance(native, Pointer) else native
            if data and data.get("__buf"):
                dst = data["__buf"]
                src_bytes = bytes(self._buffer)
                if isinstance(dst, bytearray):
                    dst[:] = src_bytes
                elif hasattr(dst, "_type_") and hasattr(dst, "_length_"):
                    for i, b in enumerate(src_bytes):
                        dst[i] = b
                return native
        return self.ptr


_FMT_MAP: dict[str, str] = {
    "int8": "<b",
    "uint8": "<B",
    "int16": "<h",
    "uint16": "<H",
    "int32": "<i",
    "uint32": "<I",
    "int64": "<q",
    "uint64": "<Q",
    "float32": "<f",
    "float64": "<d",
    "pointer": "<Q",
    "cstring": "<Q",
}


def _read_value(buf: Any, offset: int, type_name: str, _size: int) -> Any:
    fmt = _FMT_MAP.get(type_name)
    if fmt:
        return _struct.unpack_from(fmt, buf, offset)[0]
    return 0


def _write_value(buf: Any, offset: int, type_name: str, _size: int, value: Any) -> None:
    fmt = _FMT_MAP.get(type_name)
    if fmt:
        if type_name in ("pointer", "cstring"):
            value = int(value)
        _struct.pack_into(fmt, buf, offset, value)


def _make_struct_class(
    fields: dict[str, Any],
    packed: int | None = None,
    alloc_native: Callable[[int], Any] | None = None,
    free_native: Callable[[Any], None] | None = None,
) -> type:
    normalized = normalize_fields(fields)
    field_infos: list[dict[str, Any]] = []
    offset = 0
    for name, nt in normalized.items():
        a = min(get_normalized_align(nt), packed) if packed else get_normalized_align(nt)
        if not packed and offset % a != 0:
            offset = ((offset // a) + 1) * a
        type_name = nt.name if nt.kind == "primitive" else None
        field_infos.append({
            "name": name,
            "offset": offset,
            "type": nt,
            "type_name": type_name,
            "size": TYPE_SIZES.get(nt.name, 0) if nt.kind == "primitive" and nt.name is not None else get_normalized_size(nt),
        })
        offset += TYPE_SIZES.get(nt.name, 0) if nt.kind == "primitive" and nt.name is not None else get_normalized_size(nt)

    total_size = offset
    if not packed:
        max_align = max((get_normalized_align(nt) for nt in normalized.values()), default=1)
        total_size = ((offset + max_align - 1) // max_align) * max_align

    cls_dict: dict[str, Any] = {
        "_buffer": bytearray(total_size),
        "_fields": field_infos,
        "_struct_cls": None,
        "_total_size": total_size,
        "_packed": packed,
        "_alloc_native": alloc_native,
        "_free_native": free_native,
    }

    for fi in field_infos:
        fname = fi["name"]
        foff = fi["offset"]
        ftype_name = fi["type_name"]
        fsize = fi["size"]

        def _make_getter(off, tn, sz):
            def getter(self):
                return _read_value(self._buffer, off, tn, sz)
            return getter

        def _make_setter(off, tn, sz):
            def setter(self, value):
                _write_value(self._buffer, off, tn, sz, value)
            return setter

        cls_dict[fname] = property(_make_getter(foff, ftype_name, fsize), _make_setter(foff, ftype_name, fsize))

    def from_pointer(cls, ptr: Any) -> StructInstance:
        inst = object.__new__(cls)
        inst._buffer = bytearray(total_size)
        inst._fields = field_infos
        src_ptr = ptr if isinstance(ptr, Pointer) else Pointer(ptr)
        if src_ptr._data and src_ptr._data.get("__buf"):
            src = src_ptr._data["__buf"]
            if isinstance(src, bytearray):
                inst._buffer[:] = src[:total_size]
            else:
                inst._buffer[:] = bytes(src[:total_size])
        return inst

    cls_dict["__senri_type"] = "struct"
    cls_dict["fields"] = fields
    cls_dict["packed"] = packed
    cls_dict["from_pointer"] = classmethod(from_pointer)

    cls = type("StructInstance", (StructInstance,), cls_dict)
    cls._struct_cls = cls
    return cls


_alloc_native: Callable[[int], Any] | None = None
_free_native: Callable[[Any], None] | None = None


def set_struct_alloc(alloc_fn: Callable[[int], Any], free_fn: Callable[[Any], None]) -> None:
    global _alloc_native, _free_native
    _alloc_native = alloc_fn
    _free_native = free_fn


def struct(fields: dict[str, Any], options: dict[str, Any] | None = None) -> type:
    packed = options.get("packed") if options else None
    return _make_struct_class(fields, packed, _alloc_native, _free_native)
