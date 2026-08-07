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
import kotlinx.serialization.encodeToString
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
        val toSave = entity.copy(
            status = if (submit) "submitted" else entity.status,
            syncStatus = SyncStatus.PENDING,
            updatedAt = System.currentTimeMillis(),
        )
        studentDao.upsert(toSave)
        pendingOpDao.add(
            PendingOpEntity(
                entityType = "student",
                entityUuid = toSave.clientUuid,
                op = if (toSave.serverId == null) "create" else "update",
                payloadJson = json.encodeToString(toSave.toDtoMap()),
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

private fun StudentEntity.toDtoMap(): Map<String, String?> = mapOf(
    "client_uuid" to clientUuid,
    "school_id" to schoolId,
    "class_id" to classId,
    "section_id" to sectionId,
    "enrollment_no" to enrollmentNo,
    "roll_no" to rollNo,
    "name" to name,
    "father_name" to fatherName,
    "mother_name" to motherName,
    "dob" to dob,
    "blood_group" to bloodGroup,
    "gender" to gender,
    "address" to address,
    "mobile" to mobile,
    "enrolled_on" to enrolledOn,
    "status" to status,
)
