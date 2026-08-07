package com.schoolapp.idcard.ui.camera

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.schoolapp.idcard.data.repository.PhotoRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.io.File
import javax.inject.Inject

data class CameraUiState(
    val processing: Boolean = false,
    val done: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class CameraViewModel @Inject constructor(
    private val photos: PhotoRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(CameraUiState())
    val state = _state.asStateFlow()

    fun finalizePhoto(studentClientUuid: String, captured: File) {
        _state.value = CameraUiState(processing = true)
        viewModelScope.launch {
            try {
                photos.finalizeCapture(studentClientUuid, captured)
                _state.value = CameraUiState(done = true)
            } catch (t: Throwable) {
                _state.value = CameraUiState(error = t.message ?: "Failed to save photo")
            }
        }
    }
}
