package com.schoolapp.idcard.data.repository

import com.schoolapp.idcard.data.remote.ApiService
import com.schoolapp.idcard.data.remote.TokenStore
import com.schoolapp.idcard.data.remote.dto.LoginRequestDto
import com.schoolapp.idcard.data.remote.dto.UserDto
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val api: ApiService,
    private val tokens: TokenStore,
) {
    val isLoggedIn: Boolean get() = tokens.access != null

    suspend fun login(schoolCode: String, username: String, password: String, deviceId: String): UserDto {
        val resp = api.login(
            LoginRequestDto(
                school_code = schoolCode,
                username = username,
                password = password,
                device_id = deviceId,
            )
        )
        tokens.save(resp.access_token, resp.refresh_token)
        return resp.user
    }

    fun logout() = tokens.clear()
}
