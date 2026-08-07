package com.schoolapp.idcard.ui.sync

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.schoolapp.idcard.data.local.entity.StudentEntity
import com.schoolapp.idcard.data.repository.StudentRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

@HiltViewModel
class SyncStatusViewModel @Inject constructor(
    private val repo: StudentRepository,
) : ViewModel() {
    val items: StateFlow<List<StudentEntity>> =
        repo.observeAll().stateIn(viewModelScope, SharingStarted.Lazily, emptyList())

    fun retry() = repo.enqueueSync()
}
