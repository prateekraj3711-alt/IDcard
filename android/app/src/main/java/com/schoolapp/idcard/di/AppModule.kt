package com.schoolapp.idcard.di

import android.content.Context
import androidx.room.Room
import com.schoolapp.idcard.BuildConfig
import com.schoolapp.idcard.data.local.AppDatabase
import com.schoolapp.idcard.data.local.dao.PendingOpDao
import com.schoolapp.idcard.data.local.dao.PendingPhotoDao
import com.schoolapp.idcard.data.local.dao.StudentDao
import com.schoolapp.idcard.data.remote.ApiService
import com.schoolapp.idcard.data.remote.AuthInterceptor
import com.schoolapp.idcard.data.remote.RefreshApi
import com.schoolapp.idcard.data.remote.TokenAuthenticator
import com.schoolapp.idcard.data.remote.TokenStore
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides @Singleton
    fun provideTokenStore(@ApplicationContext ctx: Context): TokenStore = TokenStore(ctx)

    @Provides @Singleton
    fun provideJson(): Json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    @Provides @Singleton
    fun provideRefreshClient(): OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    @Provides @Singleton
    fun provideRefreshApi(client: OkHttpClient, json: Json): RefreshApi =
        Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE_URL)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(RefreshApi::class.java)

    @Provides @Singleton
    fun provideOkHttp(
        authInterceptor: AuthInterceptor,
        tokenAuthenticator: TokenAuthenticator,
    ): OkHttpClient {
        val logging = HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BODY else HttpLoggingInterceptor.Level.NONE
        }
        return OkHttpClient.Builder()
            .addInterceptor(authInterceptor)
            .authenticator(tokenAuthenticator)
            .addInterceptor(logging)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .build()
    }

    @Provides @Singleton
    fun provideRetrofit(client: OkHttpClient, json: Json): Retrofit =
        Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE_URL)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()

    @Provides @Singleton
    fun provideApi(retrofit: Retrofit): ApiService = retrofit.create(ApiService::class.java)

    @Provides @Singleton
    fun provideDatabase(@ApplicationContext ctx: Context): AppDatabase =
        Room.databaseBuilder(ctx, AppDatabase::class.java, "idcard.db").build()

    @Provides fun provideStudentDao(db: AppDatabase): StudentDao = db.studentDao()
    @Provides fun providePendingOpDao(db: AppDatabase): PendingOpDao = db.pendingOpDao()
    @Provides fun providePendingPhotoDao(db: AppDatabase): PendingPhotoDao = db.pendingPhotoDao()
}
