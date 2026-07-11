from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from senri_ffi.types.normalized import NormalizedType


class FFIAdapter(ABC):
    @abstractmethod
    def load_library(self, path: str) -> Any: ...

    @abstractmethod
    def bind_function(
        self,
        lib_handle: Any,
        name: str,
        ret_type: NormalizedType,
        arg_types: list[NormalizedType],
        options: Any = None,
    ) -> Any: ...

    @abstractmethod
    def close_library(self, lib_handle: Any) -> None: ...

    @abstractmethod
    def alloc(self, size: int) -> Any: ...

    @abstractmethod
    def free(self, ptr: Any) -> None: ...

    @abstractmethod
    def address_of(self, buffer: Any) -> int: ...

    @abstractmethod
    def register_callback(
        self,
        func: Any,
        ret_type: NormalizedType,
        arg_types: list[NormalizedType],
    ) -> Any: ...

    @abstractmethod
    def unregister_callback(self, ptr: Any) -> None: ...

    @abstractmethod
    def get_errno(self) -> int: ...

    @abstractmethod
    def get_strerror(self, errno: int) -> str: ...

    @abstractmethod
    def map_type(self, t: NormalizedType) -> Any: ...

    @abstractmethod
    def create_pointer_type(self, of_type: NormalizedType) -> Any: ...

    @abstractmethod
    def create_array_type(self, of_type: NormalizedType, length: int) -> Any: ...

    @abstractmethod
    def create_struct_type(
        self,
        fields: dict[str, NormalizedType],
        packed: int | None = None,
        size: int = 0,
        align: int = 1,
    ) -> Any: ...
