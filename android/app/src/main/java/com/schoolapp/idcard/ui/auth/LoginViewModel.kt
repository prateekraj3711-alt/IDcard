package com.schoolapp.idcard.ui.auth

import android.provider.Settings
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.schoolapp.idcard.data.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class LoginUiState(
    val schoolCode: String = "",
    val username: String = "",
    val password: String = "",
    val loading: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val repo: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(LoginUiState())
    val state = _state.asStateFlow()

    fun onSchoolCode(v: String) = _state.update { it.copy(schoolCode = v.uppercase(), error = null) }
    fun onUsername(v: String)   = _state.update { it.copy(username = v, error = null) }
    fun onPassword(v: String)   = _state.update { it.copy(password = v, error = null) }

    fun submit(onSuccess: () -> Unit) {
        val s = _state.value
        if (s.username.isBlank() || s.password.isBlank()) {
            _state.update { it.copy(error = "Enter your username/email/phone and password") }
            return
        }
        // School code only mandatory when the identifier is a plain username.
        // Email or phone lookups are global.
        val id = s.username.trim()
        val looksLikeEmail = "@" in id
        val digits = id.replace(Regex("[^0-9+]"), "")
        val looksLikePhone = !looksLikeEmail && (id.startsWith("+") || digits.length >= 7)
        if (!looksLikeEmail && !looksLikePhone && s.schoolCode.isBlank()) {
            _state.update { it.copy(error = "School code required for username sign-in") }
            return
        }
        _state.update { it.copy(loading = true) }
        viewModelScope.launch {
            try {
                repo.login(s.schoolCode, s.username, s.password, deviceId = "android-${android.os.Build.MODEL}")
                onSuccess()
            } catch (t: Throwable) {
                _state.update { it.copy(loading = false, error = friendlyError(t)) }
            }
        }
    }

    private fun friendlyError(t: Throwable): String {
        val http = t as? retrofit2.HttpException
        val bodyDetail = http?.let {
            try { it.response()?.errorBody()?.string() } catch (_: Throwable) { null }
        }?.let { body ->
            Regex("\"detail\"\\s*:\\s*\"([^\"]+)\"").find(body)?.groupValues?.get(1)
                ?: Regex("\"msg\"\\s*:\\s*\"([^\"]+)\"").find(body)?.groupValues?.get(1)
        }
        val code = http?.code()
        val raw = t.message.orEmpty()
        return when {
            code == 401 -> "Wrong username or password."
            code == 404 -> "That user isn't registered yet."
            code == 422 -> bodyDetail ?: "Please check the email/phone format."
            code != null && code >= 500 -> "Server error — please try again shortly."
            bodyDetail != null -> bodyDetail
            raw.contains("Unable to resolve host", ignoreCase = true) ->
                "Can't reach the server. Check your internet connection."
            raw.contains("timeout", ignoreCase = true) ->
                "Server took too long to respond. Please retry in a moment."
            raw.isBlank() -> "Login failed. Please try again."
            else -> raw
        }
    }
}
