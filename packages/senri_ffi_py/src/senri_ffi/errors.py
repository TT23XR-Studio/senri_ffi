class FFIError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.name = "FFIError"


class FFITypeError(FFIError):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.name = "FFITypeError"


class FFIBackendError(FFIError):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.name = "FFIBackendError"
