package com.schoolapp.idcard.data.local

import androidx.room.TypeConverter
import com.schoolapp.idcard.data.local.entity.SyncStatus

class Converters {
    @TypeConverter fun fromStatus(v: SyncStatus): String = v.name
    @TypeConverter fun toStatus(v: String): SyncStatus = SyncStatus.valueOf(v)
}
