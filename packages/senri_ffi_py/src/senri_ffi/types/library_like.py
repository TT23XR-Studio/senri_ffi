from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

from senri_ffi.types.normalized import NormalizedType

MANDATORY_METHODS: tuple[str, ...] = (
    "open", "bind", "close",
    "alloc", "free", "address_of",
    "register_callback", "unregister_callback",
    "get_errno", "get_strerror",
)


@runtime_checkable
class LibraryLike(Protocol):
    def open(self, path: str) -> Any: ...
    def bind(
        self,
        handle: Any,
        name: str,
        ret_type: NormalizedType,
        arg_types: list[NormalizedType],
    ) -> Any: ...
    def close(self, handle: Any) -> None: ...
    def alloc(self, size: int) -> Any: ...
    def free(self, ptr: Any) -> None: ...
    def address_of(self, buffer: Any) -> int: ...
    def register_callback(
        self,
        func: Any,
        ret_type: NormalizedType,
        arg_types: list[NormalizedType],
    ) -> Any: ...
    def unregister_callback(self, ptr: Any) -> None: ...
    def get_errno(self) -> int: ...
    def get_strerror(self, errno: int) -> str: ...


def is_library_like(obj: Any) -> bool:
    if obj is None or not isinstance(obj, (object, type)):
        return False
    for method in MANDATORY_METHODS:
        if not callable(getattr(obj, method, None)):
            return False
    return True


def get_missing_methods(obj: Any) -> list[str]:
    missing: list[str] = []
    if obj is None or not isinstance(obj, (object, type)):
        return list(MANDATORY_METHODS)
    for method in MANDATORY_METHODS:
        if not callable(getattr(obj, method, None)):
            missing.append(method)
    return missing
