import pytest

from senri_ffi.errors import FFIError
from senri_ffi.memory import alloc, free
from senri_ffi.pointer import Pointer


class TestPointerCreation:
    def test_from_int(self):
        p = Pointer(0)
        assert p.is_null()

    def test_from_ptr_dict(self):
        p = Pointer({"__ptr": 12345, "__size": 8})
        assert p.address == 12345
        assert p.to_int() == 12345

    def test_from_bytearray(self):
        buf = bytearray(16)
        p = Pointer(buf)
        assert p.address == 0

    def test_is_null(self):
        assert Pointer(0).is_null()
        assert not Pointer(1).is_null()


class TestPointerReadWrite:
    def test_int32_rw(self, adapter):
        p = alloc(32)
        p.write_int32(0, 42)
        assert p.read_int32(0) == 42
        p.write_int32(4, -100)
        assert p.read_int32(4) == -100
        free(p)

    def test_int64_rw(self, adapter):
        p = alloc(32)
        p.write_int64(0, 2 ** 40)
        assert p.read_int64(0) == 2 ** 40
        free(p)

    def test_uint64_rw(self, adapter):
        p = alloc(16)
        p.write_uint64(0, 2 ** 64 - 1)
        assert p.read_uint64(0) == 2 ** 64 - 1
        free(p)

    def test_float32_rw(self, adapter):
        p = alloc(16)
        p.write_float32(0, 3.14)
        assert abs(p.read_float32(0) - 3.14) < 0.01
        free(p)

    def test_float64_rw(self, adapter):
        p = alloc(16)
        p.write_float64(0, 3.141592653589793)
        assert p.read_float64(0) == 3.141592653589793
        free(p)

    def test_uint8_rw(self, adapter):
        p = alloc(16)
        p.write_uint8(0, 200)
        assert p.read_uint8(0) == 200
        free(p)

    def test_int16_rw(self, adapter):
        p = alloc(16)
        p.write_int16(0, -1234)
        assert p.read_int16(0) == -1234
        free(p)

    def test_cstring_rw(self, adapter):
        p = alloc(64)
        p.write_cstring(0, "hello world")
        assert p.read_cstring(0) == "hello world"
        free(p)

    def test_pointer_rw(self, adapter):
        p = alloc(16)
        p.write_pointer(0, 42424242)
        assert p.read_pointer(0).address == 42424242
        free(p)

    def test_add(self, adapter):
        p = alloc(32)
        p.write_int32(0, 10)
        p.write_int32(4, 20)
        p2 = p.add(4)
        assert p2.read_int32(0) == 20
        free(p)


class TestPointerErrors:
    def test_read_without_buffer(self):
        p = Pointer(12345)
        with pytest.raises(FFIError):
            p.read_int32(0)

    def test_write_without_buffer(self):
        p = Pointer(12345)
        with pytest.raises(FFIError):
            p.write_int32(0, 42)


class TestAllocFree:
    def test_alloc_zero_raises(self, adapter):
        with pytest.raises(FFIError):
            alloc(0)

    def test_alloc_negative_raises(self, adapter):
        with pytest.raises(FFIError):
            alloc(-1)

    def test_fake_object_to_int(self, adapter):
        p = alloc(32)
        assert not p.is_null()
        free(p)
