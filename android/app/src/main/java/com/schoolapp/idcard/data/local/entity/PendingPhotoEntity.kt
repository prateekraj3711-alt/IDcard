package com.schoolapp.idcard.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "pending_photos")
data class PendingPhotoEntity(
    @PrimaryKey val id: String,
    val studentClientUuid: String,
    val localPath: String,
    val sha256: String,
    val sizeBytes: Long,
    val width: Int,
    val height: Int,
    val syncStatus: SyncStatus = SyncStatus.PENDING,
    val storageKey: String? = null,
    val attempts: Int = 0,
    val createdAt: Long = System.currentTimeMillis(),
)
