package com.schoolapp.idcard.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import com.schoolapp.idcard.data.local.entity.PendingPhotoEntity
import com.schoolapp.idcard.data.local.entity.SyncStatus

@Dao
interface PendingPhotoDao {
    @Insert
    suspend fun add(row: PendingPhotoEntity)

    @Query("SELECT * FROM pending_photos WHERE syncStatus = 'PENDING' OR syncStatus = 'FAILED' LIMIT :limit")
    suspend fun pending(limit: Int = 25): List<PendingPhotoEntity>

    @Query("UPDATE pending_photos SET syncStatus = :status, storageKey = :key WHERE id = :id")
    suspend fun updateStatus(id: String, status: SyncStatus, key: String?)

    @Query("DELETE FROM pending_photos WHERE id = :id")
    suspend fun remove(id: String)
}
