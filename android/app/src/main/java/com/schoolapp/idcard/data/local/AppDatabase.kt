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
    version = 2,
    exportSchema = false,
)
@TypeConverters(Converters::class)
val MIGRATION_1_2 = object : androidx.room.migration.Migration(1, 2) {
    override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE students ADD COLUMN extraJson TEXT")
    }
}

abstract class AppDatabase : RoomDatabase() {
    abstract fun studentDao(): StudentDao
    abstract fun pendingOpDao(): PendingOpDao
    abstract fun pendingPhotoDao(): PendingPhotoDao
}
