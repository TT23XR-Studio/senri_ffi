import pytest

from senri_ffi.errors import FFITypeError
from senri_ffi.types.constants import TYPES, TYPE_SIZES, TYPE_ALIGNS
from senri_ffi.types.normalized import (
    NormalizedType,
    get_normalized_align,
    get_normalized_size,
    normalize_type,
    serialize_type,
)


class TestConstants:
    def test_types_keys(self):
        for name in ("void", "int8", "uint8", "int16", "uint16",
                     "int32", "uint32", "int64", "uint64",
                     "float32", "float64", "pointer", "cstring"):
            assert name in TYPES

    def test_sizes(self):
        assert TYPE_SIZES["int8"] == 1
        assert TYPE_SIZES["int16"] == 2
        assert TYPE_SIZES["int32"] == 4
        assert TYPE_SIZES["int64"] == 8
        assert TYPE_SIZES["float32"] == 4
        assert TYPE_SIZES["float64"] == 8
        assert TYPE_SIZES["pointer"] == 8
        assert TYPE_SIZES["void"] == 0

    def test_aligns(self):
        assert TYPE_ALIGNS["int8"] == 1
        assert TYPE_ALIGNS["int32"] == 4
        assert TYPE_ALIGNS["int64"] == 8
        assert TYPE_ALIGNS["pointer"] == 8


class TestNormalize:
    def test_normalize_primitive_string(self):
        t = normalize_type("int32")
        assert t.kind == "primitive"
        assert t.name == "int32"

    def test_normalize_pointer_descriptor(self):
        t = normalize_type({"__senri_type": "pointer", "innerType": "uint8"})
        assert t.kind == "pointer"
        assert t.of is not None
        assert t.of.kind == "primitive"
        assert t.of.name == "uint8"

    def test_normalize_array_descriptor(self):
        t = normalize_type({"__senri_type": "array", "innerType": "int32", "length": 5})
        assert t.kind == "array"
        assert t.length == 5

    def test_normalize_struct_descriptor(self):
        t = normalize_type({"__senri_type": "struct", "fields": {"x": "int32", "y": "int32"}})
        assert t.kind == "struct"
        assert t.fields is not None
        assert "x" in t.fields
        assert "y" in t.fields

    def test_normalize_invalid_raises(self):
        with pytest.raises(FFITypeError):
            normalize_type(123)


class TestSerialize:
    def test_serialize_primitive(self):
        t = normalize_type("int32")
        assert serialize_type(t) == "p:int32"

    def test_serialize_pointer(self):
        t = normalize_type({"__senri_type": "pointer", "innerType": "uint8"})
        assert serialize_type(t) == "*p:uint8"

    def test_serialize_array(self):
        t = normalize_type({"__senri_type": "array", "innerType": "int32", "length": 3})
        assert serialize_type(t) == "[3]p:int32"

    def test_serialize_struct(self):
        t = normalize_type({"__senri_type": "struct", "fields": {"x": "int32", "y": "int32"}})
        s = serialize_type(t)
        assert s.startswith("{")
        assert s.endswith("}")
        assert "x=p:int32" in s
        assert "y=p:int32" in s


class TestNormalizedSize:
    def test_primitive_size(self):
        assert get_normalized_size(normalize_type("int32")) == 4
        assert get_normalized_size(normalize_type("int64")) == 8
        assert get_normalized_size(normalize_type("void")) == 0

    def test_pointer_size(self):
        assert get_normalized_size(normalize_type({"__senri_type": "pointer", "innerType": "int32"})) == 8

    def test_array_size(self):
        t = normalize_type({"__senri_type": "array", "innerType": "int32", "length": 10})
        assert get_normalized_size(t) == 40


class TestNormalizedAlign:
    def test_primitive_align(self):
        assert get_normalized_align(normalize_type("int8")) == 1
        assert get_normalized_align(normalize_type("int32")) == 4
        assert get_normalized_align(normalize_type("float64")) == 8

    def test_pointer_align(self):
        t = normalize_type({"__senri_type": "pointer", "innerType": "int32"})
        assert get_normalized_align(t) == 8
