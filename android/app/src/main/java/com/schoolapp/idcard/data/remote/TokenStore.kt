package com.schoolapp.idcard.data.remote

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Persistent, at-rest-encrypted store for the signed-in teacher's session.
 * Backs both the tokens the auth interceptor needs and the profile fields
 * the UI wants to render ("Hi, Prateek", school badge, etc.) so the app
 * can resume the session across restarts without a second login.
 */
data class SessionInfo(
    val userId: String,
    val fullName: String,
    val email: String,
    val role: String,
    val schoolId: String?,
    val schoolCode: String?,
    val schoolName: String?,
)

@Singleton
class TokenStore @Inject constructor(context: Context) {

    private val prefs = run {
        val master = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "auth-store",
            master,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    @Volatile var access: String? = prefs.getString(KEY_ACCESS, null)
        private set
    val refresh: String? get() = prefs.getString(KEY_REFRESH, null)

    fun save(access: String, refresh: String) {
        this.access = access
        prefs.edit()
            .putString(KEY_ACCESS, access)
            .putString(KEY_REFRESH, refresh)
            .apply()
    }

    fun saveSession(info: SessionInfo) {
        prefs.edit()
            .putString(KEY_USER_ID, info.userId)
            .putString(KEY_FULL_NAME, info.fullName)
            .putString(KEY_EMAIL, info.email)
            .putString(KEY_ROLE, info.role)
            .putString(KEY_SCHOOL_ID, info.schoolId)
            .putString(KEY_SCHOOL_CODE, info.schoolCode)
            .putString(KEY_SCHOOL_NAME, info.schoolName)
            .apply()
    }

    fun session(): SessionInfo? {
        val userId = prefs.getString(KEY_USER_ID, null) ?: return null
        return SessionInfo(
            userId = userId,
            fullName = prefs.getString(KEY_FULL_NAME, "") ?: "",
            email = prefs.getString(KEY_EMAIL, "") ?: "",
            role = prefs.getString(KEY_ROLE, "") ?: "",
            schoolId = prefs.getString(KEY_SCHOOL_ID, null),
            schoolCode = prefs.getString(KEY_SCHOOL_CODE, null),
            schoolName = prefs.getString(KEY_SCHOOL_NAME, null),
        )
    }

    fun hasSession(): Boolean = access != null && prefs.getString(KEY_USER_ID, null) != null

    fun clear() {
        access = null
        prefs.edit().clear().apply()
    }

    private companion object {
        const val KEY_ACCESS = "access"
        const val KEY_REFRESH = "refresh"
        const val KEY_USER_ID = "user_id"
        const val KEY_FULL_NAME = "full_name"
        const val KEY_EMAIL = "email"
        const val KEY_ROLE = "role"
        const val KEY_SCHOOL_ID = "school_id"
        const val KEY_SCHOOL_CODE = "school_code"
        const val KEY_SCHOOL_NAME = "school_name"
    }
}
