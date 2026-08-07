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
        if (s.schoolCode.isBlank() || s.username.isBlank() || s.password.isBlank()) {
            _state.update { it.copy(error = "Please fill all fields") }; return
        }
        _state.update { it.copy(loading = true) }
        viewModelScope.launch {
            try {
                repo.login(s.schoolCode, s.username, s.password, deviceId = "android-${android.os.Build.MODEL}")
                onSuccess()
            } catch (t: Throwable) {
                _state.update { it.copy(loading = false, error = t.message ?: "Login failed") }
            }
        }
    }
}
