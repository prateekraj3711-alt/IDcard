from fastapi import HTTPException, status


class AppError(HTTPException):
    def __init__(self, code: int, detail: str, errors: list[dict] | None = None):
        super().__init__(status_code=code, detail={"detail": detail, "errors": errors or []})


class NotFound(AppError):
    def __init__(self, entity: str):
        super().__init__(status.HTTP_404_NOT_FOUND, f"{entity} not found")


class Forbidden(AppError):
    def __init__(self, msg: str = "forbidden"):
        super().__init__(status.HTTP_403_FORBIDDEN, msg)


class Unauthorized(AppError):
    def __init__(self, msg: str = "unauthorized"):
        super().__init__(status.HTTP_401_UNAUTHORIZED, msg)


class Conflict(AppError):
    def __init__(self, msg: str):
        super().__init__(status.HTTP_409_CONFLICT, msg)


class Validation(AppError):
    def __init__(self, msg: str, errors: list[dict] | None = None):
        super().__init__(status.HTTP_422_UNPROCESSABLE_ENTITY, msg, errors)
