package com.schoolapp.idcard.data.remote

import com.schoolapp.idcard.data.remote.dto.LoginRequestDto
import com.schoolapp.idcard.data.remote.dto.LoginResponseDto
import com.schoolapp.idcard.data.remote.dto.PhotoCompleteDto
import com.schoolapp.idcard.data.remote.dto.PhotoUploadUrlDto
import com.schoolapp.idcard.data.remote.dto.PhotoUploadRequestDto
import com.schoolapp.idcard.data.remote.dto.RefreshRequestDto
import com.schoolapp.idcard.data.remote.dto.StudentDto
import com.schoolapp.idcard.data.remote.dto.SyncBatchRequestDto
import com.schoolapp.idcard.data.remote.dto.SyncBatchResponseDto
import com.schoolapp.idcard.data.remote.dto.TokenPairDto
import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path

interface ApiService {
    @POST("auth/login")
    suspend fun login(@Body req: LoginRequestDto): LoginResponseDto

    @POST("auth/refresh")
    suspend fun refresh(@Body req: RefreshRequestDto): TokenPairDto

    @POST("students")
    suspend fun createStudent(
        @Body body: StudentDto,
        @Header("Idempotency-Key") idempotencyKey: String,
    ): StudentDto

    @POST("sync/batch")
    suspend fun syncBatch(@Body body: SyncBatchRequestDto): SyncBatchResponseDto

    @POST("students/{id}/photo/upload-url")
    suspend fun photoUploadUrl(
        @Path("id") studentId: String,
        @Body req: PhotoUploadRequestDto,
    ): PhotoUploadUrlDto

    @POST("students/{id}/photo/complete")
    suspend fun photoComplete(
        @Path("id") studentId: String,
        @Body req: PhotoCompleteDto,
    ): Unit
}
