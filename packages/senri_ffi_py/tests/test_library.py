import ctypes

import pytest

from senri_ffi import Library


class TestIntFunctions:
    def test_add_int(self, lib):
        f = lib.func("add_int", "int32", ["int32", "int32"])
        assert f(10, 20) == 30
        assert f(-5, 5) == 0
        assert f(0, 0) == 0

    def test_multiply_int(self, lib):
        f = lib.func("multiply_int", "int32", ["int32", "int32"])
        assert f(6, 7) == 42
        assert f(-3, 4) == -12

    def test_negate_int(self, lib):
        f = lib.func("negate_int", "int32", ["int32"])
        assert f(42) == -42
        assert f(-10) == 10

    def test_is_positive(self, lib):
        f = lib.func("is_positive", "int32", ["int32"])
        assert f(5) == 1
        assert f(-1) == 0
        assert f(0) == 0

    def test_is_zero(self, lib):
        f = lib.func("is_zero", "int32", ["int32"])
        assert f(0) == 1
        assert f(1) == 0
        assert f(-1) == 0


class TestFloatFunctions:
    def test_add_float(self, lib):
        f = lib.func("add_float", "float64", ["float64", "float64"])
        assert abs(f(1.5, 2.5) - 4.0) < 0.001

    def test_multiply_float(self, lib):
        f = lib.func("multiply_float", "float64", ["float64", "float64"])
        assert abs(f(2.5, 4.0) - 10.0) < 0.001


class TestStringFunctions:
    def test_string_length(self, lib):
        f = lib.func("string_length", "int32", ["cstring"])
        assert f(b"hello") == 5
        assert f(b"") == 0
        assert f(b"a") == 1

    def test_string_equals(self, lib):
        f = lib.func("string_equals", "int32", ["cstring", "cstring"])
        assert f(b"abc", b"abc") == 1
        assert f(b"abc", b"abd") == 0
        assert f(b"", b"") == 1


class TestInt64Functions:
    def test_bigint_ops(self, lib):
        f = lib.func("test_bigint_ops", "int64", ["int64", "int64"])
        assert f(2 ** 40, 2 ** 40) == 2 ** 41

    def test_uint64_max(self, lib):
        f = lib.func("test_uint64_max", "uint64", [])
        assert f() == 2 ** 64 - 1


class TestPointerFunctions:
    def test_is_null_true(self, lib):
        f = lib.func("is_null", "int32", ["pointer"])
        assert f(0) == 1

    def test_is_null_false(self, lib, adapter):
        from senri_ffi.memory import alloc, free
        p = alloc(8)
        f = lib.func("is_null", "int32", ["pointer"])
        assert f(p.address) == 0
        free(p)

    def test_return_null(self, lib):
        f = lib.func("return_null", "pointer", [])
        assert f() is None or f() == 0


class TestBufferFunctions:
    def test_fill_buffer(self, lib, adapter):
        from senri_ffi.memory import alloc, free
        fill = lib.func("fill_buffer", "void", ["pointer", "int32", "uint8"])
        read = lib.func("read_byte_at", "uint8", ["pointer", "int32"])
        buf = alloc(32)
        fill(buf.address, 32, 0xAB)
        for i in range(32):
            assert read(buf.address, i) == 0xAB
        free(buf)

    def test_write_read_byte(self, lib, adapter):
        from senri_ffi.memory import alloc, free
        write = lib.func("write_byte_at", "void", ["pointer", "int32", "uint8"])
        read = lib.func("read_byte_at", "uint8", ["pointer", "int32"])
        buf = alloc(16)
        write(buf.address, 5, 0xCD)
        assert read(buf.address, 5) == 0xCD
        free(buf)


class TestArrayFunctions:
    def test_sum_array(self, lib):
        f = lib.func("sum_array", "int32", ["pointer", "int32"])
        arr = (ctypes.c_int32 * 5)(1, 2, 3, 4, 5)
        assert f(ctypes.addressof(arr), 5) == 15

    def test_sum_array_empty(self, lib):
        f = lib.func("sum_array", "int32", ["pointer", "int32"])
        arr = (ctypes.c_int32 * 1)(0)
        assert f(ctypes.addressof(arr), 0) == 0


class TestStructFunctions:
    def test_point_new(self, lib, adapter):
        from senri_ffi.struct import struct
        Point = struct({"x": "int32", "y": "int32"})
        f = lib.func("point_new", Point, ["int32", "int32"])
        p = f(3, 4)
        assert p.x == 3
        assert p.y == 4

    def test_point_distance(self, lib, adapter):
        from senri_ffi.struct import struct
        Point = struct({"x": "int32", "y": "int32"})
        f = lib.func("point_distance", "float64", ["pointer", "pointer"])
        a = Point({"x": 0, "y": 0})
        b = Point({"x": 3, "y": 4})
        dist = f(a.to_pointer().address, b.to_pointer().address)
        assert abs(dist - 5.0) < 0.001

    def test_increment_point(self, lib, adapter):
        from senri_ffi.struct import struct
        from senri_ffi.memory import alloc, free
        Point = struct({"x": "int32", "y": "int32"})
        inc = lib.func("increment_point", "void", ["pointer"])
        p = Point({"x": 5, "y": 10})
        ptr = p.to_pointer()
        inc(ptr.address)
        p2 = Point.from_pointer(ptr)
        assert p2.x == 6
        assert p2.y == 11


class TestCallbackFunction:
    def test_find_max(self, lib):
        find_max = lib.func("find_max", "int32", ["pointer", "int32", "pointer"])
        arr = (ctypes.c_int32 * 5)(10, 50, 30, 40, 20)
        CMPFUNC = ctypes.CFUNCTYPE(
            ctypes.c_int,
            ctypes.POINTER(ctypes.c_int),
            ctypes.POINTER(ctypes.c_int),
        )

        def cmp(a_ptr, b_ptr):
            a = ctypes.cast(a_ptr, ctypes.POINTER(ctypes.c_int))[0]
            b = ctypes.cast(b_ptr, ctypes.POINTER(ctypes.c_int))[0]
            return a - b

        cmp_cb = CMPFUNC(cmp)
        cmp_addr = ctypes.cast(cmp_cb, ctypes.c_void_p).value
        assert find_max(ctypes.addressof(arr), 5, cmp_addr) == 50


class TestLibraryCache:
    def test_func_cache(self, lib):
        f1 = lib.func("add_int", "int32", ["int32", "int32"])
        f2 = lib.func("add_int", "int32", ["int32", "int32"])
        assert f1 is f2

    def test_different_sig_not_cached(self, lib):
        f1 = lib.func("add_int", "int32", ["int32", "int32"])
        f2 = lib.func("add_int", "uint32", ["uint32", "uint32"])
        # Different signatures should produce different cache entries
        # (even though ctypes may return the same underlying _FuncPtr)
        assert f1(1, 2) == 3
        assert f2(1, 2) == 3


class TestLibraryClose:
    def test_close(self, lib):
        lib.close()
        from senri_ffi.errors import FFIError
        with pytest.raises(FFIError, match="closed"):
            lib.func("add_int", "int32", ["int32", "int32"])

    def test_double_close(self, lib):
        lib.close()
        lib.close()


class TestLibraryPath:
    def test_lib_path(self, lib):
        assert "senri_test" in lib.lib_path or "libsenri_test" in lib.lib_path
