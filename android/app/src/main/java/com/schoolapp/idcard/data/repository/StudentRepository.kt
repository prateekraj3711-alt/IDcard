package com.schoolapp.idcard.data.repository

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.schoolapp.idcard.data.local.dao.PendingOpDao
import com.schoolapp.idcard.data.local.dao.StudentDao
import com.schoolapp.idcard.data.local.entity.PendingOpEntity
import com.schoolapp.idcard.data.local.entity.StudentEntity
import com.schoolapp.idcard.data.local.entity.SyncStatus
import com.schoolapp.idcard.worker.SyncStudentsWorker
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import com.schoolapp.idcard.data.remote.dto.StudentDto
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class StudentRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val studentDao: StudentDao,
    private val pendingOpDao: PendingOpDao,
    private val json: Json,
) {
    fun observeAll(): Flow<List<StudentEntity>> = studentDao.observeAll()

    suspend fun getByUuid(uuid: String): StudentEntity? = studentDao.findByClientUuid(uuid)

    suspend fun saveDraft(entity: StudentEntity, submit: Boolean) {
        // Keep a photo captured before the first save (the camera writes it separately).
        val existing = studentDao.findByClientUuid(entity.clientUuid)
        val toSave = entity.copy(
            serverId = entity.serverId ?: existing?.serverId,
            localPhotoPath = entity.localPhotoPath ?: existing?.localPhotoPath,
            syncStatus = SyncStatus.PENDING,
            updatedAt = System.currentTimeMillis(),
        )
        studentDao.upsert(toSave)
        pendingOpDao.add(
            PendingOpEntity(
                entityType = "student",
                entityUuid = toSave.clientUuid,
                op = if (toSave.serverId == null) "create" else "update",
                payloadJson = json.encodeToString(StudentDto.serializer(), toSave.toDto(json)),
                idempotencyKey = UUID.randomUUID().toString(),
            )
        )
        enqueueSync()
    }

    fun enqueueSync() {
        val work = OneTimeWorkRequestBuilder<SyncStudentsWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(context)
            .enqueueUniqueWork("sync-students", ExistingWorkPolicy.KEEP, work)
    }
}

internal fun StudentEntity.toDto(json: Json): StudentDto = StudentDto(
    client_uuid = clientUuid, school_id = schoolId, class_id = classId, section_id = sectionId,
    enrollment_no = enrollmentNo.ifBlank { null }, roll_no = rollNo, name = name,
    father_name = fatherName, mother_name = motherName, dob = dob, blood_group = bloodGroup,
    gender = gender, address = address, mobile = mobile, enrolled_on = enrolledOn, status = status,
    extra = extraJson?.let { runCatching { json.decodeFromString<Map<String, String>>(it) }.getOrNull() },
)
