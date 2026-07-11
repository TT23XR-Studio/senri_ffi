import pytest

from senri_ffi.struct import struct


class TestStructBasic:
    def test_create_simple(self, adapter):
        Point = struct({"x": "int32", "y": "int32"})
        p = Point({"x": 10, "y": 20})
        assert p.x == 10
        assert p.y == 20

    def test_setter(self, adapter):
        Point = struct({"x": "int32", "y": "int32"})
        p = Point()
        p.x = 100
        p.y = 200
        assert p.x == 100
        assert p.y == 200

    def test_no_init(self, adapter):
        Point = struct({"x": "int32", "y": "int32"})
        p = Point()
        assert p.x == 0
        assert p.y == 0

    def test_sizeof(self, adapter):
        Point = struct({"x": "int32", "y": "int32"})
        assert Point._total_size == 8

    def test_with_float(self, adapter):
        Vec3 = struct({"x": "float64", "y": "float64", "z": "float64"})
        v = Vec3({"x": 1.0, "y": 2.0, "z": 3.0})
        assert v.x == 1.0
        assert v.y == 2.0
        assert v.z == 3.0


class TestStructLayout:
    def test_alignment_padding(self, adapter):
        S = struct({"a": "int8", "b": "int32"})
        assert S._total_size == 8

    def test_packed(self, adapter):
        S = struct({"a": "int8", "b": "int32"}, {"packed": 1})
        assert S._total_size == 5

    def test_mixed_types(self, adapter):
        Mixed = struct({
            "flag": "uint8",
            "count": "int32",
            "ratio": "float64",
            "big": "int64",
        })
        m = Mixed({"flag": 1, "count": 42, "ratio": 0.5, "big": 2 ** 40})
        assert m.flag == 1
        assert m.count == 42
        assert m.ratio == 0.5
        assert m.big == 2 ** 40


class TestStructPointer:
    def test_to_pointer(self, adapter):
        Point = struct({"x": "int32", "y": "int32"})
        p = Point({"x": 5, "y": 10})
        ptr = p.to_pointer()
        assert ptr.read_int32(0) == 5
        assert ptr.read_int32(4) == 10

    def test_from_pointer(self, adapter):
        Point = struct({"x": "int32", "y": "int32"})
        p = Point({"x": 1, "y": 2})
        ptr = p.to_pointer()
        p2 = Point.from_pointer(ptr)
        assert p2.x == 1
        assert p2.y == 2


class TestStructTypeDescriptor:
    def test_has_senri_type(self, adapter):
        Point = struct({"x": "int32", "y": "int32"})
        assert getattr(Point, "__senri_type", None) == "struct"

    def test_has_fields(self, adapter):
        Point = struct({"x": "int32", "y": "int32"})
        assert "x" in Point.fields
        assert "y" in Point.fields
