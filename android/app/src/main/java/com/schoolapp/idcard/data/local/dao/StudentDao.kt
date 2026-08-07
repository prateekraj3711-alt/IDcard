package com.schoolapp.idcard.data.local.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.schoolapp.idcard.data.local.entity.StudentEntity
import com.schoolapp.idcard.data.local.entity.SyncStatus
import kotlinx.coroutines.flow.Flow

@Dao
interface StudentDao {
    @Upsert
    suspend fun upsert(student: StudentEntity)

    @Query("SELECT * FROM students WHERE clientUuid = :uuid")
    suspend fun findByClientUuid(uuid: String): StudentEntity?

    @Query("SELECT * FROM students ORDER BY updatedAt DESC")
    fun observeAll(): Flow<List<StudentEntity>>

    @Query("UPDATE students SET syncStatus = :status, lastSyncError = :err WHERE clientUuid = :uuid")
    suspend fun updateSyncStatus(uuid: String, status: SyncStatus, err: String?)

    @Query("UPDATE students SET serverId = :serverId, syncStatus = :status WHERE clientUuid = :uuid")
    suspend fun markUploaded(uuid: String, serverId: String, status: SyncStatus = SyncStatus.UPLOADED)

    @Query("DELETE FROM students WHERE clientUuid = :uuid")
    suspend fun delete(uuid: String)
}
