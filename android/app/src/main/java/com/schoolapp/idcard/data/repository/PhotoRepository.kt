package com.schoolapp.idcard.data.repository

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.schoolapp.idcard.data.local.dao.PendingPhotoDao
import com.schoolapp.idcard.data.local.dao.StudentDao
import com.schoolapp.idcard.data.local.entity.PendingPhotoEntity
import com.schoolapp.idcard.data.local.entity.SyncStatus
import com.schoolapp.idcard.util.ImageUtil
import com.schoolapp.idcard.worker.UploadPhotoWorker
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PhotoRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val pendingPhotoDao: PendingPhotoDao,
    private val studentDao: StudentDao,
) {
    /**
     * Finalize a freshly-captured JPEG:
     *   1. Compress to 720x960 @ ~Q85 with EXIF-correct rotation (passport 3:4).
     *   2. Compute SHA-256 for content-addressed dedup.
     *   3. Insert PendingPhotoEntity + update the student's localPhotoPath.
     *   4. Enqueue UploadPhotoWorker so it uploads to R2 as soon as the
     *      student has been synced up and the device is on a network.
     */
    suspend fun finalizeCapture(studentClientUuid: String, capturedJpeg: File): PendingPhotoEntity =
        withContext(Dispatchers.IO) {
            val outDir = File(context.filesDir, "photos").apply { mkdirs() }
            val compressed = ImageUtil.compressForUpload(capturedJpeg, outDir)

            val existing = studentDao.findByClientUuid(studentClientUuid)
            if (existing != null) {
                studentDao.upsert(
                    existing.copy(
                        localPhotoPath = compressed.file.absolutePath,
                        updatedAt = System.currentTimeMillis(),
                    ),
                )
            }

            val row = PendingPhotoEntity(
                id = UUID.randomUUID().toString(),
                studentClientUuid = studentClientUuid,
                localPath = compressed.file.absolutePath,
                sha256 = compressed.sha256,
                sizeBytes = compressed.sizeBytes,
                width = compressed.width,
                height = compressed.height,
                syncStatus = SyncStatus.PENDING,
            )
            pendingPhotoDao.add(row)

            // Best-effort — delete the original camera output; the compressed
            // copy is our source of truth from here on.
            capturedJpeg.takeIf { it.exists() && it.absolutePath != compressed.file.absolutePath }?.delete()

            enqueueUploadWorker()
            row
        }

    fun enqueueUploadWorker() {
        val work = OneTimeWorkRequestBuilder<UploadPhotoWorker>()
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build(),
            )
            .build()
        WorkManager.getInstance(context)
            .enqueueUniqueWork("upload-photos", ExistingWorkPolicy.APPEND_OR_REPLACE, work)
    }
}
