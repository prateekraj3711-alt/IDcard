package com.schoolapp.idcard.ui.students

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.schoolapp.idcard.data.local.entity.StudentEntity
import com.schoolapp.idcard.data.remote.ApiService
import com.schoolapp.idcard.data.remote.dto.SchoolMiniDto
import com.schoolapp.idcard.data.repository.AuthRepository
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
    val schoolLabel: String = "",   // Cached "CODE — Name" for display
    val schools: List<SchoolMiniDto> = emptyList(),
    val schoolPickerRequired: Boolean = false,
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
    val photoPath: String? = null,
    val error: String? = null,
    val saving: Boolean = false,
    val savedOnce: Boolean = false,
)

@HiltViewModel
class StudentEditViewModel @Inject constructor(
    private val repo: StudentRepository,
    private val auth: AuthRepository,
    private val api: ApiService,
) : ViewModel() {

    private val _state = MutableStateFlow(StudentEditUiState())
    val state = _state.asStateFlow()

    init {
        // Seed from the persisted session: if the teacher was pinned to a
        // school at signup, use it. Otherwise mark the picker as required
        // and fetch the list of active schools so they can pick.
        val session = auth.currentSession
        val pinnedSchoolId = session?.schoolId
        val pinnedLabel = session?.schoolCode?.let { code ->
            session.schoolName?.let { "$code — $it" } ?: code
        } ?: ""
        _state.update {
            it.copy(
                schoolId = pinnedSchoolId ?: "",
                schoolLabel = pinnedLabel,
                schoolPickerRequired = pinnedSchoolId == null,
            )
        }
        if (pinnedSchoolId == null) {
            viewModelScope.launch {
                try {
                    val schools = api.availableSchools()
                    _state.update { it.copy(schools = schools) }
                } catch (_: Throwable) {
                    // Non-fatal — the operator will just see an empty picker
                    // and a "no schools available yet" message.
                }
            }
        }
    }

    fun load(uuid: String?) {
        if (uuid == null) return
        viewModelScope.launch {
            val row = repo.getByUuid(uuid) ?: return@launch
            _state.update {
                it.copy(
                    clientUuid = row.clientUuid,
                    schoolId = row.schoolId.ifBlank { it.schoolId },
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
                    photoPath = row.localPhotoPath,
                )
            }
        }
    }

    /**
     * Called from [StudentEditScreen] whenever it becomes visible again — the
     * camera flow may have just written a compressed photo to the row.
     */
    fun refreshPhoto() {
        val uuid = _state.value.clientUuid
        viewModelScope.launch {
            val row = repo.getByUuid(uuid) ?: return@launch
            _state.update {
                it.copy(
                    hasPhoto = row.localPhotoPath != null,
                    photoPath = row.localPhotoPath,
                )
            }
        }
    }

    fun onSchool(id: String) {
        val label = _state.value.schools.firstOrNull { it.id == id }
            ?.let { "${it.code} — ${it.name}" } ?: ""
        _state.update { it.copy(schoolId = id, schoolLabel = label, error = null) }
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

    fun clearForm() {
        val kept = _state.value
        _state.value = StudentEditUiState(
            schoolId = kept.schoolId,
            schoolLabel = kept.schoolLabel,
            schools = kept.schools,
            schoolPickerRequired = kept.schoolPickerRequired,
        )
    }

    fun clearSavedFlag() = _state.update { it.copy(savedOnce = false) }

    fun save(submit: Boolean, onDone: () -> Unit) {
        val s = _state.value
        val validation = when {
            s.schoolId.isBlank() -> "Pick a school for this candidate"
            s.name.isBlank() -> "Full name is required"
            s.enrollmentNo.isBlank() -> "Enrollment number is required"
            else -> null
        }
        if (validation != null) {
            _state.update { it.copy(error = validation) }
            return
        }
        _state.update { it.copy(saving = true, error = null) }
        viewModelScope.launch {
            try {
                repo.saveDraft(
                    StudentEntity(
                        clientUuid = s.clientUuid,
                        schoolId = s.schoolId,
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
                _state.update { it.copy(saving = false, savedOnce = submit) }
                onDone()
            } catch (t: Throwable) {
                _state.update {
                    it.copy(saving = false, error = t.message ?: "Save failed")
                }
            }
        }
    }
}
