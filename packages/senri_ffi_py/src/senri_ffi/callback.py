from __future__ import annotations

import weakref
from typing import Any, Callable

from senri_ffi.errors import FFIError
from senri_ffi.globals import get_global_adapter
from senri_ffi.pointer import Pointer
from senri_ffi.registry import get_resource_registry
from senri_ffi.types.normalized import normalize_type

_finalization_registry: weakref.WeakValueDictionary[int, Any] | None = None


def callback(
    ret_type: Any,
    arg_types: list[Any],
    js_fn: Callable[..., Any],
    options: Any = None,
) -> Pointer:
    if not callable(js_fn):
        raise FFIError("callback requires a callable")

    adapter = get_global_adapter()
    normalized_ret = normalize_type(ret_type)
    normalized_args = [normalize_type(t) for t in arg_types]

    desc = adapter.register_callback(js_fn, normalized_ret, normalized_args)

    def _unregister():
        get_resource_registry().unregister_callback(desc)
        adapter.unregister_callback(desc)

    desc["_unregister"] = _unregister
    get_resource_registry().register_callback(desc)

    return Pointer(desc)
