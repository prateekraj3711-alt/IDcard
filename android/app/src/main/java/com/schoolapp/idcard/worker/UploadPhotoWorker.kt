package com.schoolapp.idcard.worker

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.schoolapp.idcard.data.local.dao.PendingPhotoDao
import com.schoolapp.idcard.data.local.dao.StudentDao
import com.schoolapp.idcard.data.local.entity.SyncStatus
import com.schoolapp.idcard.data.remote.ApiService
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import com.schoolapp.idcard.data.remote.dto.StudentDto
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File

@HiltWorker
class UploadPhotoWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val pendingPhotoDao: PendingPhotoDao,
    private val studentDao: StudentDao,
    private val pendingOpDao: com.schoolapp.idcard.data.local.dao.PendingOpDao,
    private val json: kotlinx.serialization.json.Json,
    private val api: ApiService,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val batch = pendingPhotoDao.pending(limit = 10)
        if (batch.isEmpty()) return Result.success()

        var retryable = false
        for (photo in batch) {
            val student = studentDao.findByClientUuid(photo.studentClientUuid) ?: continue
            try {
                // Push the candidate first if it hasn't reached the server yet,
                // so the photo uploads in the same pass instead of waiting for a retry.
                var serverId: String? = student.serverId
                if (serverId == null) {
                    var id: String? = null
                    for (op in pendingOpDao.forStudent(student.clientUuid)) {
                        val dto = json.decodeFromString(StudentDto.serializer(), op.payloadJson)
                        val saved = api.createStudent(dto, op.idempotencyKey)
                        saved.id?.let { studentDao.markUploaded(saved.client_uuid, it); id = it }
                        pendingOpDao.remove(op.id)
                    }
                    serverId = id
                }
                if (serverId == null) { retryable = true; continue }
                val file = File(photo.localPath)
                val part = MultipartBody.Part.createFormData(
                    "file", file.name, file.asRequestBody("image/jpeg".toMediaType()),
                )
                val result = api.uploadPhoto(serverId, part)
                pendingPhotoDao.updateStatus(photo.id, SyncStatus.UPLOADED, result.photo_path)
                pendingPhotoDao.remove(photo.id)
            } catch (t: Throwable) {
                retryable = true
                pendingPhotoDao.updateStatus(photo.id, SyncStatus.FAILED, null)
            }
        }
        return if (retryable) Result.retry() else Result.success()
    }
}
