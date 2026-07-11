from __future__ import annotations

import sys

from senri_ffi.errors import FFIError
from senri_ffi.registry import get_resource_registry
from senri_ffi.types.adapter import FFIAdapter

_adapter: FFIAdapter | None = None
_version: int = 0


def set_global_adapter(adapter: FFIAdapter, force: bool = False) -> None:
    global _adapter, _version
    if _adapter is not None and _adapter is not adapter:
        registry = get_resource_registry()
        if registry.has_active_resources():
            if not force:
                mem_count = registry.get_active_memory_count()
                cb_count = registry.get_active_callback_count()
                raise FFIError(
                    f"Cannot switch FFI backend: there are {mem_count} active memory allocation(s) and "
                    f"{cb_count} active callback(s). Free all resources before switching, "
                    "or pass force=True to set_global_adapter to force switch (risky)."
                )
            print(
                "[SenRi FFI] WARNING: Force-switching adapter with active resources. "
                "Existing pointers and callbacks may cause crashes or memory leaks.",
                file=sys.stderr,
            )
            registry.clear()
    _adapter = adapter
    _version += 1


def get_global_adapter() -> FFIAdapter:
    if _adapter is None:
        raise FFIError("Adapter not initialized")
    return _adapter


def get_global_adapter_version() -> int:
    return _version


def is_adapter_initialized() -> bool:
    return _adapter is not None
