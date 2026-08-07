package com.schoolapp.idcard.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import com.schoolapp.idcard.data.local.dao.PendingOpDao
import com.schoolapp.idcard.data.local.dao.PendingPhotoDao
import com.schoolapp.idcard.data.local.dao.StudentDao
import com.schoolapp.idcard.data.local.entity.PendingOpEntity
import com.schoolapp.idcard.data.local.entity.PendingPhotoEntity
import com.schoolapp.idcard.data.local.entity.StudentEntity

@Database(
    entities = [StudentEntity::class, PendingOpEntity::class, PendingPhotoEntity::class],
    version = 1,
    exportSchema = false,
)
@TypeConverters(Converters::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun studentDao(): StudentDao
    abstract fun pendingOpDao(): PendingOpDao
    abstract fun pendingPhotoDao(): PendingPhotoDao
}
