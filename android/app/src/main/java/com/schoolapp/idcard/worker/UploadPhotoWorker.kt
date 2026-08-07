package com.schoolapp.idcard.worker

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.schoolapp.idcard.data.local.dao.PendingPhotoDao
import com.schoolapp.idcard.data.local.dao.StudentDao
import com.schoolapp.idcard.data.local.entity.SyncStatus
import com.schoolapp.idcard.data.remote.ApiService
import com.schoolapp.idcard.data.remote.dto.PhotoCompleteDto
import com.schoolapp.idcard.data.remote.dto.PhotoUploadRequestDto
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File

@HiltWorker
class UploadPhotoWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val pendingPhotoDao: PendingPhotoDao,
    private val studentDao: StudentDao,
    private val api: ApiService,
    private val http: OkHttpClient,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val batch = pendingPhotoDao.pending(limit = 10)
        if (batch.isEmpty()) return Result.success()

        var retryable = false
        for (photo in batch) {
            val student = studentDao.findByClientUuid(photo.studentClientUuid) ?: continue
            val serverId = student.serverId ?: run { retryable = true; continue }
            try {
                val signed = api.photoUploadUrl(
                    serverId,
                    PhotoUploadRequestDto(
                        sha256 = photo.sha256,
                        size_bytes = photo.sizeBytes,
                    ),
                )
                val body = File(photo.localPath).asRequestBody("image/jpeg".toMediaType())
                val req = Request.Builder().url(signed.url).put(body).apply {
                    signed.required_headers.forEach { (k, v) -> header(k, v) }
                }.build()
                http.newCall(req).execute().use { r ->
                    if (!r.isSuccessful) throw RuntimeException("upload failed ${r.code}")
                }
                api.photoComplete(
                    serverId,
                    PhotoCompleteDto(
                        storage_key = signed.storage_key,
                        sha256 = photo.sha256,
                        size_bytes = photo.sizeBytes,
                        width = photo.width,
                        height = photo.height,
                    ),
                )
                pendingPhotoDao.updateStatus(photo.id, SyncStatus.UPLOADED, signed.storage_key)
                pendingPhotoDao.remove(photo.id)
            } catch (t: Throwable) {
                retryable = true
                pendingPhotoDao.updateStatus(photo.id, SyncStatus.FAILED, null)
            }
        }
        return if (retryable) Result.retry() else Result.success()
    }
}
