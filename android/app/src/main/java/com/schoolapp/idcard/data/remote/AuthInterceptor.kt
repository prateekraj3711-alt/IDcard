package com.schoolapp.idcard.data.remote

import com.schoolapp.idcard.data.remote.dto.RefreshRequestDto
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthInterceptor @Inject constructor(
    private val tokens: TokenStore,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val req = chain.request()
        val access = tokens.access
        val newReq = if (access != null && req.header("Authorization") == null) {
            req.newBuilder().header("Authorization", "Bearer $access").build()
        } else req
        return chain.proceed(newReq)
    }
}

@Singleton
class TokenAuthenticator @Inject constructor(
    private val tokens: TokenStore,
    private val refreshApi: RefreshApi,
) : Authenticator {

    private val refreshLock = Mutex()

    override fun authenticate(route: Route?, response: Response): Request? {
        if (response.request.header("Authorization") == null) return null
        if (responseCount(response) >= 2) return null

        val refresh = tokens.refresh ?: return null
        val newAccess: String = try {
            runBlocking {
                refreshLock.withLock {
                    val pair = refreshApi.refresh(RefreshRequestDto(refresh_token = refresh))
                    tokens.save(pair.access_token, pair.refresh_token)
                    pair.access_token
                }
            }
        } catch (_: Throwable) {
            tokens.clear()
            return null
        }
        return response.request.newBuilder().header("Authorization", "Bearer $newAccess").build()
    }

    private fun responseCount(r: Response): Int {
        var count = 1
        var prior = r.priorResponse
        while (prior != null) { count++; prior = prior.priorResponse }
        return count
    }
}

/** Small standalone Retrofit interface bound to a client WITHOUT the authenticator, to avoid loops. */
interface RefreshApi {
    @retrofit2.http.POST("auth/refresh")
    suspend fun refresh(@retrofit2.http.Body req: RefreshRequestDto): com.schoolapp.idcard.data.remote.dto.TokenPairDto
}
