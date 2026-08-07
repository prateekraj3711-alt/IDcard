package com.schoolapp.idcard.data.remote.dto

import kotlinx.serialization.Serializable

@Serializable
data class LoginRequestDto(
    val school_code: String? = null,
    val username: String? = null,
    val email: String? = null,
    val phone: String? = null,
    val password: String,
    val device_id: String? = null,
)

@Serializable
data class SchoolMiniDto(val id: String, val code: String, val name: String)

@Serializable
data class UserDto(
    val id: String,
    val full_name: String,
    val email: String,
    val role: String,
    val school: SchoolMiniDto? = null,
)

@Serializable
data class TokenPairDto(
    val access_token: String,
    val refresh_token: String,
    val token_type: String = "Bearer",
    val expires_in: Int,
)

@Serializable
data class LoginResponseDto(
    val access_token: String,
    val refresh_token: String,
    val token_type: String,
    val expires_in: Int,
    val user: UserDto,
)

@Serializable
data class RefreshRequestDto(val refresh_token: String, val device_id: String? = null)

@Serializable
data class TeacherSignupRequestDto(
    val school_code: String? = null,
    val full_name: String,
    val email: String? = null,
    val phone: String? = null,
    val password: String,
    val device_id: String? = null,
)

@Serializable
data class StudentDto(
    val id: String? = null,
    val client_uuid: String,
    val school_id: String,
    val class_id: String? = null,
    val section_id: String? = null,
    val enrollment_no: String,
    val roll_no: String? = null,
    val name: String,
    val father_name: String? = null,
    val mother_name: String? = null,
    val dob: String? = null,
    val blood_group: String? = null,
    val gender: String? = null,
    val address: String? = null,
    val mobile: String? = null,
    val enrolled_on: String? = null,
    val status: String = "submitted",
)

@Serializable
data class PhotoUploadRequestDto(
    val sha256: String,
    val size_bytes: Long,
    val content_type: String = "image/jpeg",
)

@Serializable
data class PhotoUploadUrlDto(
    val url: String,
    val storage_key: String,
    val expires_in: Int,
    val required_headers: Map<String, String>,
)

@Serializable
data class PhotoCompleteDto(
    val storage_key: String,
    val sha256: String,
    val size_bytes: Long,
    val width: Int? = null,
    val height: Int? = null,
)

@Serializable
data class SyncOperationDto(
    val op: String,
    val type: String,
    val client_uuid: String,
    val payload: Map<String, kotlinx.serialization.json.JsonElement>,
)

@Serializable
data class SyncBatchRequestDto(
    val device_id: String,
    val operations: List<SyncOperationDto>,
)

@Serializable
data class SyncOperationResultDto(
    val client_uuid: String,
    val status: String,
    val server_id: String? = null,
    val error: String? = null,
)

@Serializable
data class SyncBatchResponseDto(val results: List<SyncOperationResultDto>)
