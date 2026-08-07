from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser
from app.domain.schemas import (
    StudentCreate,
    SyncBatchIn,
    SyncBatchOut,
    SyncOperationResult,
)
from app.infrastructure.db.models import SyncLog, SyncOp, SyncStatus
from app.services.students import StudentService


class SyncService:
    def __init__(self, session: AsyncSession):
        self.s = session

    async def apply_batch(self, req: SyncBatchIn, user: CurrentUser) -> SyncBatchOut:
        students = StudentService(self.s)
        results: list[SyncOperationResult] = []

        for op in req.operations:
            log = SyncLog(
                client_uuid=op.client_uuid,
                device_id=req.device_id,
                user_id=user.id,
                operation=op.op,
                status=SyncStatus.uploading,
                payload=op.payload,
            )
            self.s.add(log)
            try:
                if op.type == "student" and op.op in {SyncOp.create, SyncOp.update}:
                    dto = StudentCreate.model_validate({**op.payload, "client_uuid": str(op.client_uuid)})
                    student = await students.upsert(dto, user)
                    log.status = SyncStatus.uploaded
                    log.student_id = student.id
                    results.append(
                        SyncOperationResult(
                            client_uuid=op.client_uuid,
                            status=SyncStatus.uploaded,
                            server_id=student.id,
                        )
                    )
                else:
                    raise ValueError(f"unsupported op: {op.type}/{op.op}")
            except Exception as exc:  # per-op failure isolation
                log.status = SyncStatus.failed
                log.error = str(exc)
                results.append(
                    SyncOperationResult(
                        client_uuid=op.client_uuid,
                        status=SyncStatus.failed,
                        error=str(exc),
                    )
                )

        await self.s.commit()
        return SyncBatchOut(results=results)
