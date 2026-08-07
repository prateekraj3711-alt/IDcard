package com.schoolapp.idcard.data.repository

import com.schoolapp.idcard.data.remote.ApiService
import com.schoolapp.idcard.data.remote.SessionInfo
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
    val isLoggedIn: Boolean get() = tokens.hasSession()
    val currentSession: SessionInfo? get() = tokens.session()

    private fun UserDto.toSession() = SessionInfo(
        userId = id,
        fullName = full_name,
        email = email,
        role = role,
        schoolId = school?.id,
        schoolCode = school?.code,
        schoolName = school?.name,
    )

    suspend fun login(schoolCode: String, identifier: String, password: String, deviceId: String): UserDto {
        // Route the identifier to the right server field. Backend accepts:
        //   • email               → global lookup, no school code needed
        //   • phone               → global lookup, no school code needed
        //   • username+school     → scoped lookup within one school
        // A leading "+" or a string that's ≥ 7 digits with no letters is
        // treated as a phone number so someone signing up with just a mobile
        // can sign in the same way, without needing to remember their
        // auto-generated username.
        val id = identifier.trim()
        val looksLikeEmail = "@" in id
        val digitsOnly = id.replace(Regex("[^0-9+]"), "")
        val looksLikePhone = !looksLikeEmail && (
            id.startsWith("+") ||
                (digitsOnly.length >= 7 && id.all { it.isDigit() || it == '+' || it == ' ' || it == '-' })
        )
        val resp = api.login(
            LoginRequestDto(
                school_code = schoolCode.ifBlank { null },
                username = if (!looksLikeEmail && !looksLikePhone) id else null,
                email = if (looksLikeEmail) id else null,
                phone = if (looksLikePhone) id else null,
                password = password,
                device_id = deviceId,
            )
        )
        tokens.save(resp.access_token, resp.refresh_token)
        tokens.saveSession(resp.user.toSession())
        return resp.user
    }

    suspend fun signupTeacher(
        schoolCode: String?,
        fullName: String,
        email: String?,
        phone: String?,
        password: String,
        deviceId: String,
    ): UserDto {
        val resp = api.signupTeacher(
            TeacherSignupRequestDto(
                school_code = schoolCode?.trim()?.ifBlank { null },
                full_name = fullName,
                email = email?.ifBlank { null },
                phone = phone?.ifBlank { null },
                password = password,
                device_id = deviceId,
            )
        )
        tokens.save(resp.access_token, resp.refresh_token)
        tokens.saveSession(resp.user.toSession())
        return resp.user
    }

    fun logout() = tokens.clear()
}
