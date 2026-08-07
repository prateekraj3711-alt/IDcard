package com.schoolapp.idcard.worker

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.schoolapp.idcard.data.local.dao.PendingOpDao
import com.schoolapp.idcard.data.local.dao.StudentDao
import com.schoolapp.idcard.data.local.entity.SyncStatus
import com.schoolapp.idcard.data.remote.ApiService
import com.schoolapp.idcard.data.remote.dto.StudentDto
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import kotlinx.serialization.json.Json
import java.io.IOException
import kotlin.math.min

@HiltWorker
class SyncStudentsWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val pendingOpDao: PendingOpDao,
    private val studentDao: StudentDao,
    private val api: ApiService,
    private val json: Json,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val ops = pendingOpDao.due(now = System.currentTimeMillis(), limit = 50)
        if (ops.isEmpty()) return Result.success()

        var retryable = false
        for (op in ops) {
            try {
                when (op.entityType) {
                    "student" -> {
                        val dto = json.decodeFromString(StudentDto.serializer(), op.payloadJson)
                        val saved = api.createStudent(dto, op.idempotencyKey)
                        studentDao.markUploaded(saved.client_uuid, saved.id ?: continue)
                        pendingOpDao.remove(op.id)
                    }
                    else -> pendingOpDao.remove(op.id)
                }
            } catch (io: IOException) {
                retryable = true
                markFailed(op.id, io.message, retriable = true)
                studentDao.updateSyncStatus(op.entityUuid, SyncStatus.PENDING, io.message)
            } catch (t: Throwable) {
                // 4xx or unexpected — do not retry automatically
                markFailed(op.id, t.message, retriable = false)
                studentDao.updateSyncStatus(op.entityUuid, SyncStatus.FAILED, t.message)
            }
        }
        return if (retryable) Result.retry() else Result.success()
    }

    private suspend fun markFailed(id: Long, err: String?, retriable: Boolean) {
        val attempts = 1
        val delayMs = if (retriable) min(30_000L * (1L shl attempts), 4 * 60 * 60_000L) else Long.MAX_VALUE / 2
        pendingOpDao.markFailed(id, err, System.currentTimeMillis() + delayMs)
    }
}
