import pytest

from senri_ffi.errors import FFIError, FFITypeError, FFIBackendError


class TestErrors:
    def test_ffi_error_is_exception(self):
        with pytest.raises(FFIError):
            raise FFIError("test")

    def test_ffi_error_message(self):
        try:
            raise FFIError("my message")
        except FFIError as e:
            assert "my message" in str(e)

    def test_ffi_type_error_inherits_ffi_error(self):
        assert issubclass(FFITypeError, FFIError)
        with pytest.raises(FFIError):
            raise FFITypeError("type error")

    def test_ffi_backend_error_inherits_ffi_error(self):
        assert issubclass(FFIBackendError, FFIError)
        with pytest.raises(FFIError):
            raise FFIBackendError("backend error")

    def test_error_names(self):
        assert FFIError("x").name == "FFIError"
        assert FFITypeError("x").name == "FFITypeError"
        assert FFIBackendError("x").name == "FFIBackendError"
