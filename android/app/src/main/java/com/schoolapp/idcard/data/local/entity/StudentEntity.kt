package com.schoolapp.idcard.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

enum class SyncStatus { PENDING, UPLOADING, UPLOADED, FAILED }

@Entity(tableName = "students")
data class StudentEntity(
    @PrimaryKey val clientUuid: String,
    val serverId: String? = null,
    val schoolId: String,
    val classId: String? = null,
    val sectionId: String? = null,
    val enrollmentNo: String,
    val rollNo: String? = null,
    val name: String,
    val fatherName: String? = null,
    val motherName: String? = null,
    val dob: String? = null,        // ISO yyyy-MM-dd
    val bloodGroup: String? = null,
    val gender: String? = null,
    val address: String? = null,
    val mobile: String? = null,
    val enrolledOn: String? = null,
    val status: String = "draft",
    val syncStatus: SyncStatus = SyncStatus.PENDING,
    val lastSyncError: String? = null,
    val localPhotoPath: String? = null,
    val updatedAt: Long = System.currentTimeMillis(),
)
