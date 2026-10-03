from .contracts import ApiError


class ServiceError(Exception):
    def __init__(self, status: int, code: str, message: str, details=None):
        super().__init__(message)
        self.status = status
        self.error = ApiError(code=code, message=message, details=details)
