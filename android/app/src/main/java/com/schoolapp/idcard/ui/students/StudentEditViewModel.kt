package com.schoolapp.idcard.ui.students

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.schoolapp.idcard.data.local.entity.StudentEntity
import com.schoolapp.idcard.data.repository.StudentRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

data class StudentEditUiState(
    val clientUuid: String = UUID.randomUUID().toString(),
    val schoolId: String = "",
    val name: String = "",
    val enrollmentNo: String = "",
    val rollNo: String? = null,
    val fatherName: String? = null,
    val motherName: String? = null,
    val dob: String? = null,
    val bloodGroup: String? = null,
    val mobile: String? = null,
    val address: String? = null,
    val hasPhoto: Boolean = false,
    val error: String? = null,
    val saving: Boolean = false,
)

@HiltViewModel
class StudentEditViewModel @Inject constructor(
    private val repo: StudentRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(StudentEditUiState())
    val state = _state.asStateFlow()

    fun load(uuid: String?) {
        if (uuid == null) return
        viewModelScope.launch {
            val row = repo.getByUuid(uuid) ?: return@launch
            _state.value = StudentEditUiState(
                clientUuid = row.clientUuid,
                schoolId = row.schoolId,
                name = row.name,
                enrollmentNo = row.enrollmentNo,
                rollNo = row.rollNo,
                fatherName = row.fatherName,
                motherName = row.motherName,
                dob = row.dob,
                bloodGroup = row.bloodGroup,
                mobile = row.mobile,
                address = row.address,
                hasPhoto = row.localPhotoPath != null,
            )
        }
    }

    fun onName(v: String) = _state.update { it.copy(name = v, error = null) }
    fun onEnrollment(v: String) = _state.update { it.copy(enrollmentNo = v.uppercase(), error = null) }
    fun onRollNo(v: String) = _state.update { it.copy(rollNo = v) }
    fun onFatherName(v: String) = _state.update { it.copy(fatherName = v) }
    fun onMotherName(v: String) = _state.update { it.copy(motherName = v) }
    fun onDob(v: String) = _state.update { it.copy(dob = v) }
    fun onBloodGroup(v: String) = _state.update { it.copy(bloodGroup = v) }
    fun onMobile(v: String) = _state.update { it.copy(mobile = v) }
    fun onAddress(v: String) = _state.update { it.copy(address = v) }

    fun save(submit: Boolean, onDone: () -> Unit) {
        val s = _state.value
        if (s.name.isBlank() || s.enrollmentNo.isBlank()) {
            _state.update { it.copy(error = "Name and enrollment number required") }; return
        }
        _state.update { it.copy(saving = true) }
        viewModelScope.launch {
            repo.saveDraft(
                StudentEntity(
                    clientUuid = s.clientUuid,
                    schoolId = s.schoolId,   // hydrated from logged-in user in real code
                    enrollmentNo = s.enrollmentNo,
                    name = s.name,
                    rollNo = s.rollNo,
                    fatherName = s.fatherName,
                    motherName = s.motherName,
                    dob = s.dob,
                    bloodGroup = s.bloodGroup,
                    mobile = s.mobile,
                    address = s.address,
                    status = if (submit) "submitted" else "draft",
                ),
                submit = submit,
            )
            onDone()
        }
    }
}
