package com.schoolapp.idcard.ui.auth

import android.os.Build
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.schoolapp.idcard.data.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SignupUiState(
    val schoolCode: String = "",
    val fullName: String = "",
    val email: String = "",
    val phone: String = "",
    val password: String = "",
    val confirm: String = "",
    val loading: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class SignupViewModel @Inject constructor(
    private val repo: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(SignupUiState())
    val state = _state.asStateFlow()

    fun onSchoolCode(v: String) = _state.update { it.copy(schoolCode = v.uppercase(), error = null) }
    fun onFullName(v: String) = _state.update { it.copy(fullName = v, error = null) }
    fun onEmail(v: String) = _state.update { it.copy(email = v, error = null) }
    fun onPhone(v: String) = _state.update { it.copy(phone = v, error = null) }
    fun onPassword(v: String) = _state.update { it.copy(password = v, error = null) }
    fun onConfirm(v: String) = _state.update { it.copy(confirm = v, error = null) }

    fun submit(onSuccess: () -> Unit) {
        val s = _state.value
        val problem = validate(s)
        if (problem != null) {
            _state.update { it.copy(error = problem) }
            return
        }
        _state.update { it.copy(loading = true) }
        viewModelScope.launch {
            try {
                repo.signupTeacher(
                    schoolCode = s.schoolCode,
                    fullName = s.fullName,
                    email = s.email,
                    phone = s.phone,
                    password = s.password,
                    deviceId = "android-${Build.MODEL}",
                )
                onSuccess()
            } catch (t: Throwable) {
                _state.update { it.copy(loading = false, error = extractApiError(t) ?: "Sign up failed") }
            }
        }
    }

    private fun extractApiError(t: Throwable): String? {
        val http = t as? retrofit2.HttpException ?: return t.message
        val body = try { http.response()?.errorBody()?.string() } catch (_: Throwable) { null }
        if (body.isNullOrBlank()) return http.message()
        // FastAPI returns {"detail": "..."} or {"detail": [{"msg": "..."}]}
        return Regex("\"detail\"\\s*:\\s*\"([^\"]+)\"").find(body)?.groupValues?.get(1)
            ?: Regex("\"msg\"\\s*:\\s*\"([^\"]+)\"").find(body)?.groupValues?.get(1)
            ?: body.take(200)
    }

    private fun validate(s: SignupUiState): String? {
        if (s.schoolCode.isBlank()) return "School code is required"
        if (s.fullName.length < 2) return "Enter your full name"
        if (s.email.isBlank() && s.phone.isBlank()) return "Provide either email or phone"
        if (s.password.length < 8) return "Password must be at least 8 characters"
        if (s.password != s.confirm) return "Passwords don't match"
        return null
    }
}
