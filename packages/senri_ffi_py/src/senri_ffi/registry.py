from __future__ import annotations

from typing import Any, Callable


class ResourceRegistry:
    def __init__(self) -> None:
        self._memory: set[int] = set()
        self._callbacks: set[int] = set()

    def register_memory(self, block: Any) -> None:
        self._memory.add(id(block))

    def unregister_memory(self, block: Any) -> None:
        self._memory.discard(id(block))

    def register_callback(self, cb: Any) -> None:
        self._callbacks.add(id(cb))

    def unregister_callback(self, cb: Any) -> None:
        self._callbacks.discard(id(cb))

    def has_active_resources(self) -> bool:
        return len(self._memory) > 0 or len(self._callbacks) > 0

    def get_active_memory_count(self) -> int:
        return len(self._memory)

    def get_active_callback_count(self) -> int:
        return len(self._callbacks)

    def for_each_memory(self, fn: Callable[[int], None]) -> None:
        for block_id in list(self._memory):
            fn(block_id)

    def for_each_callback(self, fn: Callable[[int], None]) -> None:
        for cb_id in list(self._callbacks):
            fn(cb_id)

    def clear(self) -> None:
        self._memory.clear()
        self._callbacks.clear()


_REGISTRY: ResourceRegistry | None = None


def get_resource_registry() -> ResourceRegistry:
    global _REGISTRY
    if _REGISTRY is None:
        _REGISTRY = ResourceRegistry()
    return _REGISTRY
