import pytest

from senri_ffi.adapters.ctypes_adapter import CtypesAdapter
from senri_ffi.errors import FFIError


class TestCtypesAdapter:
    def test_load_library_invalid_path(self):
        adapter = CtypesAdapter()
        with pytest.raises(FFIError, match="Failed to load library"):
            adapter.load_library("/nonexistent/path/libfake.so")

    def test_alloc_returns_dict(self):
        adapter = CtypesAdapter()
        result = adapter.alloc(64)
        assert "__ptr" in result
        assert "__buf" in result
        assert "__size" in result
        assert result["__size"] == 64
        assert isinstance(result["__ptr"], int)

    def test_alloc_address_stable(self):
        adapter = CtypesAdapter()
        result = adapter.alloc(32)
        buf = result["__buf"]
        addr = result["__ptr"]
        assert addr != 0

    def test_get_errno(self):
        adapter = CtypesAdapter()
        assert isinstance(adapter.get_errno(), int)

    def test_get_strerror(self):
        adapter = CtypesAdapter()
        result = adapter.get_strerror(2)
        assert isinstance(result, str)

    def test_map_type_returns_string(self):
        from senri_ffi.types.normalized import normalize_type
        adapter = CtypesAdapter()
        t = normalize_type("int32")
        assert adapter.map_type(t) == "p:int32"

    def test_create_pointer_type(self):
        from senri_ffi.types.normalized import normalize_type
        adapter = CtypesAdapter()
        t = normalize_type("int32")
        result = adapter.create_pointer_type(t)
        assert result == "*p:int32"

    def test_create_array_type(self):
        from senri_ffi.types.normalized import normalize_type
        adapter = CtypesAdapter()
        t = normalize_type("int32")
        result = adapter.create_array_type(t, 5)
        assert result == "[5]p:int32"


class TestCtypesBindFunction:
    def test_bind_nonexistent_symbol(self, adapter):
        from pathlib import Path
        from senri_ffi.types.normalized import normalize_type

        ROOT = Path(__file__).resolve().parent.parent.parent.parent
        TEST_LIB_DIR = ROOT / "test-lib"
        system = __import__("platform").system()
        if system == "Windows":
            lib_path = TEST_LIB_DIR / "target" / "release" / "senri_test.dll"
        elif system == "Darwin":
            lib_path = TEST_LIB_DIR / "target" / "release" / "libsenri_test.dylib"
        else:
            lib_path = TEST_LIB_DIR / "target" / "release" / "libsenri_test.so"

        if not lib_path.exists():
            pytest.skip("test-lib not available")
        handle = adapter.load_library(str(lib_path))
        ret = normalize_type("int32")
        args = [normalize_type("int32")]
        with pytest.raises(FFIError, match="symbol not found"):
            adapter.bind_function(handle, "nonexistent_function", ret, args)
