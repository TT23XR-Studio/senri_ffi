from __future__ import annotations

from typing import Any, Literal

from senri_ffi.errors import FFITypeError
from senri_ffi.types.constants import TYPES, TYPE_SIZES, TYPE_ALIGNS

PrimitiveName = Literal[
    "void",
    "int8", "uint8",
    "int16", "uint16",
    "int32", "uint32",
    "int64", "uint64",
    "float32", "float64",
    "cstring",
    "pointer",
]


class NormalizedType:
    def __init__(
        self,
        kind: Literal["primitive", "pointer", "array", "struct"],
        name: PrimitiveName | None = None,
        of: NormalizedType | None = None,
        length: int = 0,
        fields: dict[str, NormalizedType] | None = None,
        packed: int | None = None,
        size: int = 0,
        align: int = 1,
    ) -> None:
        self.kind = kind
        self.name = name
        self.of = of
        self.length = length
        self.fields = fields
        self.packed = packed
        self.size = size
        self.align = align

    @classmethod
    def primitive(cls, name: PrimitiveName) -> NormalizedType:
        return cls(kind="primitive", name=name)

    @classmethod
    def pointer(cls, of: NormalizedType) -> NormalizedType:
        return cls(kind="pointer", of=of)

    @classmethod
    def array(cls, of: NormalizedType, length: int) -> NormalizedType:
        return cls(kind="array", of=of, length=length)

    @classmethod
    def struct(
        cls,
        fields: dict[str, NormalizedType],
        packed: int | None = None,
        size: int = 0,
        align: int = 1,
    ) -> NormalizedType:
        return cls(kind="struct", fields=fields, packed=packed, size=size, align=align)

    def __repr__(self) -> str:
        if self.kind == "primitive":
            return f"NormalizedType({self.kind}, {self.name})"
        if self.kind == "pointer":
            return f"NormalizedType({self.kind}, of={self.of})"
        if self.kind == "array":
            return f"NormalizedType({self.kind}, of={self.of}, length={self.length})"
        return f"NormalizedType({self.kind}, fields={{{list(self.fields or {})}}})"


def get_normalized_size(t: NormalizedType) -> int:
    if t.kind == "primitive":
        assert t.name is not None
        return TYPE_SIZES[t.name]
    if t.kind == "pointer":
        return TYPE_SIZES["pointer"]
    if t.kind == "array":
        assert t.of is not None
        return get_normalized_size(t.of) * t.length
    return t.size


def get_normalized_align(t: NormalizedType) -> int:
    if t.kind == "primitive":
        assert t.name is not None
        return TYPE_ALIGNS[t.name]
    if t.kind == "pointer":
        return TYPE_ALIGNS["pointer"]
    if t.kind == "array":
        assert t.of is not None
        return get_normalized_align(t.of)
    return t.align


def _is_type_descriptor(t: Any) -> bool:
    if isinstance(t, dict) and "__senri_type" in t:
        return True
    if isinstance(t, type) and hasattr(t, "__senri_type"):
        return True
    return False


def _is_primitive_string(t: Any) -> bool:
    return isinstance(t, str) and t in TYPES


def normalize_fields(fields: dict[str, Any]) -> dict[str, NormalizedType]:
    return {k: normalize_type(v) for k, v in fields.items()}


def compute_normalized_layout(
    fields: dict[str, NormalizedType],
    packed: int | None = None,
) -> int:
    offset = 0
    max_align = 1
    for nt in fields.values():
        if packed is not None:
            a = min(get_normalized_align(nt), packed)
        else:
            a = get_normalized_align(nt)
        if not packed and offset % a != 0:
            offset = ((offset // a) + 1) * a
        offset += get_normalized_size(nt)
        max_align = max(max_align, a)
    if packed:
        return offset
    return ((offset + max_align - 1) // max_align) * max_align


def normalize_type(t: Any) -> NormalizedType:
    if _is_primitive_string(t):
        return NormalizedType.primitive(t)

    if not _is_type_descriptor(t):
        msg = f"Unknown type descriptor: {t!r}"
        raise FFITypeError(msg)

    if isinstance(t, type):
        tt = getattr(t, "__senri_type", None)
    else:
        tt = t.get("__senri_type") if isinstance(t, dict) else getattr(t, "__senri_type", None)

    if tt == "pointer":
        if isinstance(t, type):
            raise FFITypeError(f"Cannot normalize pointer from type object: {t!r}")
        inner = normalize_type(t.get("innerType", TYPES["pointer"]))
        return NormalizedType.pointer(inner)

    if tt == "array":
        if isinstance(t, type):
            raise FFITypeError(f"Cannot normalize array from type object: {t!r}")
        inner = normalize_type(t["innerType"])
        return NormalizedType.array(inner, t.get("length", 0))

    if tt == "struct":
        fields_dict = t.fields if isinstance(t, type) else t.get("fields", {})
        fields = normalize_fields(fields_dict)
        packed = t.packed if isinstance(t, type) else t.get("packed")
        total_size = compute_normalized_layout(fields, packed)
        max_align = 1
        for nt in fields.values():
            max_align = max(max_align, get_normalized_align(nt))
        return NormalizedType.struct(fields, packed, total_size, max_align)

    msg = f"Unknown type descriptor: {t!r}"
    raise FFITypeError(msg)


def serialize_type(t: NormalizedType) -> str:
    if t.kind == "primitive":
        assert t.name is not None
        return "p:" + t.name
    if t.kind == "pointer":
        assert t.of is not None
        return "*" + serialize_type(t.of)
    if t.kind == "array":
        assert t.of is not None
        return f"[{t.length}]" + serialize_type(t.of)
    if t.kind == "struct":
        parts = sorted(f"{k}={serialize_type(v)}" for k, v in (t.fields or {}).items())
        prefix = "#" if t.packed else ""
        return "{" + prefix + ",".join(parts) + "}"
    return ""
