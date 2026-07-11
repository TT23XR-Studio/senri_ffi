from __future__ import annotations

from typing import Any, Callable, cast

from senri_ffi.adapters.ctypes_adapter import CtypesAdapter
from senri_ffi.adapters.custom_wrapper import CustomAdapterWrapper
from senri_ffi.errors import FFIError, FFITypeError
from senri_ffi.globals import (
    get_global_adapter,
    get_global_adapter_version,
    is_adapter_initialized,
    set_global_adapter,
)
from senri_ffi.memory import alloc as _memory_alloc, free as _memory_free
from senri_ffi.registry import get_resource_registry
from senri_ffi.struct import set_struct_alloc
from senri_ffi.types.adapter import FFIAdapter
from senri_ffi.types.library_like import get_missing_methods, is_library_like
from senri_ffi.types.normalized import normalize_type, serialize_type

MAX_CACHE_SIZE = 500


def _detect_adapter() -> FFIAdapter:
    try:
        import cffi as _cffi_mod  # pyright: ignore[reportMissingModuleSource] # noqa: F401
        from senri_ffi.adapters.cffi_adapter import CffiAdapter
        return CffiAdapter()
    except ImportError:
        pass
    return CtypesAdapter()


def _perform_smoke_test(instance: Any) -> None:
    import os
    if os.environ.get("SENRI_FFI_SKIP_SMOKE_TEST") == "1":
        return
    try:
        mem = instance.alloc(1)
        if not isinstance(mem.get("__ptr"), int):
            raise FFITypeError("alloc(1) returned object with invalid __ptr: expected int")
        if not mem.get("__buf"):
            raise FFITypeError("alloc(1) returned object with missing or falsy __buf")
        if not isinstance(mem.get("__size"), int):
            raise FFITypeError("alloc(1) returned object with invalid __size: expected int")
        instance.free(mem)
        errno_val = instance.get_errno()
        if not isinstance(errno_val, int):
            raise FFITypeError("get_errno() returned invalid type: expected int")
    except FFITypeError:
        raise
    except Exception as e:
        raise FFITypeError(f"Smoke test failed: {e}") from e


def _resolve_backend(backend: Any, path: str) -> Any:
    if isinstance(backend, type):
        return backend(path)
    if isinstance(backend, object):
        return backend
    raise FFITypeError(f"Invalid backend: expected a LibraryLike object or a constructor, got {type(backend).__name__}")


class Library:
    def __init__(
        self,
        handle: Any,
        path: str,
        adapter: FFIAdapter,
        version: int,
    ) -> None:
        self._handle = handle
        self._lib_path = path
        self._closed = False
        self._func_cache: dict[str, Any] = {}
        self._async_cache: dict[str, Any] = {}
        self._adapter = adapter
        self._adapter_version = version

    def _check_alive(self) -> None:
        if self._closed:
            raise FFIError("Library is closed")
        if get_global_adapter_version() != self._adapter_version:
            raise FFIError(
                "Library instance has expired: the global FFI backend has been replaced. "
                "Please reload the library via Library.load()."
            )

    def _set_cache(self, cache: dict[str, Any], key: str, value: Any) -> None:
        if len(cache) >= MAX_CACHE_SIZE:
            oldest = next(iter(cache))
            del cache[oldest]
        cache[key] = value

    @staticmethod
    def load(path: str, backend: Any = None) -> Library:
        if backend is None:
            if not is_adapter_initialized():
                adapter = _detect_adapter()
                set_global_adapter(adapter)
                set_struct_alloc(_memory_alloc, _memory_free)
            else:
                adapter = get_global_adapter()
        else:
            instance = _resolve_backend(backend, path)
            if not is_library_like(instance):
                missing = get_missing_methods(instance)
                raise FFITypeError(f"Invalid backend: missing mandatory methods: {', '.join(missing)}")
            _perform_smoke_test(instance)
            wrapper = CustomAdapterWrapper(instance)
            adapter = wrapper

        if adapter is not get_global_adapter() and is_adapter_initialized():
            old = get_global_adapter()
            if getattr(old, "_is_custom_backend", False):
                if hasattr(old, "cleanup"):
                    cast(Any, old).cleanup()
            registry = get_resource_registry()
            registry.for_each_callback(lambda cb_id: None)
            set_global_adapter(adapter)

        handle = adapter.load_library(path)
        return Library(handle, path, adapter, get_global_adapter_version())

    def func(
        self,
        name: str,
        ret_type: Any,
        arg_types: list[Any],
        options: Any = None,
    ) -> Callable[..., Any]:
        self._check_alive()

        normalized_ret = normalize_type(ret_type)
        normalized_args = [normalize_type(t) for t in arg_types]

        cache_key = (
            name
            + "|"
            + serialize_type(normalized_ret)
            + "|"
            + ",".join(serialize_type(a) for a in normalized_args)
        )
        cached = self._func_cache.get(cache_key)
        if cached is not None:
            return cached

        bound = self._adapter.bind_function(
            self._handle, name, normalized_ret, normalized_args, options
        )
        self._set_cache(self._func_cache, cache_key, bound)
        return bound

    @property
    def lib_path(self) -> str:
        return self._lib_path

    def close(self) -> None:
        if self._closed:
            return
        self._adapter.close_library(self._handle)
        self._func_cache.clear()
        self._handle = None
        self._closed = True
