package com.schoolapp.idcard.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "pending_ops")
data class PendingOpEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val entityType: String,      // "student" | "photo"
    val entityUuid: String,      // student.clientUuid
    val op: String,              // "create" | "update" | "delete"
    val payloadJson: String,
    val idempotencyKey: String,
    val attempts: Int = 0,
    val nextAttemptAt: Long = 0,
    val lastError: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
)
