package com.schoolapp.idcard.data.repository

import com.schoolapp.idcard.data.remote.ApiService
import com.schoolapp.idcard.data.remote.TokenStore
import com.schoolapp.idcard.data.remote.dto.LoginRequestDto
import com.schoolapp.idcard.data.remote.dto.TeacherSignupRequestDto
import com.schoolapp.idcard.data.remote.dto.UserDto
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val api: ApiService,
    private val tokens: TokenStore,
) {
    val isLoggedIn: Boolean get() = tokens.access != null

    suspend fun login(schoolCode: String, identifier: String, password: String, deviceId: String): UserDto {
        // Identifier can be username, email, or phone — the server auto-detects.
        val looksLikeEmail = "@" in identifier
        val resp = api.login(
            LoginRequestDto(
                school_code = schoolCode,
                username = if (!looksLikeEmail) identifier else null,
                email = if (looksLikeEmail) identifier else null,
                password = password,
                device_id = deviceId,
            )
        )
        tokens.save(resp.access_token, resp.refresh_token)
        return resp.user
    }

    suspend fun signupTeacher(
        schoolCode: String,
        fullName: String,
        email: String?,
        phone: String?,
        password: String,
        deviceId: String,
    ): UserDto {
        val resp = api.signupTeacher(
            TeacherSignupRequestDto(
                school_code = schoolCode,
                full_name = fullName,
                email = email?.ifBlank { null },
                phone = phone?.ifBlank { null },
                password = password,
                device_id = deviceId,
            )
        )
        tokens.save(resp.access_token, resp.refresh_token)
        return resp.user
    }

    fun logout() = tokens.clear()
}
