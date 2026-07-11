import pytest

from senri_ffi.adapters.ctypes_adapter import CtypesAdapter
from senri_ffi.globals import (
    get_global_adapter,
    get_global_adapter_version,
    is_adapter_initialized,
    set_global_adapter,
)
from senri_ffi.errors import FFIError
from senri_ffi.registry import get_resource_registry


class TestGlobalAdapter:
    def test_set_and_get(self):
        adapter = CtypesAdapter()
        set_global_adapter(adapter, force=True)
        assert get_global_adapter() is adapter
        assert is_adapter_initialized()

    def test_version_increments(self):
        v1 = get_global_adapter_version()
        set_global_adapter(CtypesAdapter(), force=True)
        assert get_global_adapter_version() == v1 + 1

    def test_get_uninitialized_raises(self):
        import senri_ffi.globals as g
        old = g._adapter
        g._adapter = None
        try:
            with pytest.raises(FFIError, match="not initialized"):
                get_global_adapter()
        finally:
            g._adapter = old


class TestResourceRegistry:
    def test_register_unregister_memory(self):
        reg = get_resource_registry()
        reg.clear()
        obj = {"test": 1}
        reg.register_memory(obj)
        assert reg.get_active_memory_count() == 1
        assert reg.has_active_resources()
        reg.unregister_memory(obj)
        assert reg.get_active_memory_count() == 0
        assert not reg.has_active_resources()

    def test_register_unregister_callback(self):
        reg = get_resource_registry()
        reg.clear()
        cb = {"test": 1}
        reg.register_callback(cb)
        assert reg.get_active_callback_count() == 1
        reg.unregister_callback(cb)
        assert reg.get_active_callback_count() == 0

    def test_clear(self):
        reg = get_resource_registry()
        reg.register_memory({"a": 1})
        reg.register_callback({"b": 2})
        assert reg.has_active_resources()
        reg.clear()
        assert not reg.has_active_resources()

    def test_for_each_callback(self):
        reg = get_resource_registry()
        reg.clear()
        reg.register_callback(id=1) if False else None
        cb1 = {"id": 1}
        cb2 = {"id": 2}
        reg.register_callback(cb1)
        reg.register_callback(cb2)
        collected = []
        reg.for_each_callback(lambda cb_id: collected.append(cb_id))
        assert len(collected) == 2
        reg.clear()
