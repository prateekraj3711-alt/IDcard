package com.schoolapp.idcard.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import com.schoolapp.idcard.data.local.entity.PendingOpEntity

@Dao
interface PendingOpDao {
    @Insert
    suspend fun add(op: PendingOpEntity): Long

    @Query("SELECT * FROM pending_ops WHERE nextAttemptAt <= :now ORDER BY createdAt ASC LIMIT :limit")
    suspend fun due(now: Long, limit: Int = 50): List<PendingOpEntity>

    @Query("UPDATE pending_ops SET attempts = attempts + 1, lastError = :err, nextAttemptAt = :next WHERE id = :id")
    suspend fun markFailed(id: Long, err: String?, next: Long)

    @Query("DELETE FROM pending_ops WHERE id = :id")
    suspend fun remove(id: Long)
}
