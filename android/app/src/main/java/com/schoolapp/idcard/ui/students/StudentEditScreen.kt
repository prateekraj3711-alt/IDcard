package com.schoolapp.idcard.ui.students

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.schoolapp.idcard.ui.components.BrandTopBar

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StudentEditScreen(
    studentClientUuid: String?,
    onCapturePhoto: () -> Unit,
    onSaved: () -> Unit,
    vm: StudentEditViewModel = hiltViewModel(),
) {
    LaunchedEffect(studentClientUuid) { vm.load(studentClientUuid) }
    val state by vm.state.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.savedOnce) {
        if (state.savedOnce) {
            snackbarHostState.showSnackbar("Candidate submitted — added to sync queue")
            vm.clearSavedFlag()
        }
    }

    Scaffold(
        topBar = {
            BrandTopBar(
                title = if (studentClientUuid == null) "New candidate" else "Edit candidate",
                subtitle = "Draft saved locally until synced",
                onNavigateBack = onSaved,
                actions = {
                    TextButton(onClick = { vm.clearForm() }) {
                        Icon(Icons.Filled.Refresh, contentDescription = null)
                        Spacer(Modifier.width(4.dp))
                        Text("Clear")
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        containerColor = MaterialTheme.colorScheme.background,
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState())
                .fillMaxSize(),
        ) {
            // Photo card
            OutlinedCard(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    if (state.hasPhoto) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Filled.CheckCircle,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                            )
                            Spacer(Modifier.width(8.dp))
                            Text("Photo captured", style = MaterialTheme.typography.bodyMedium)
                        }
                        Spacer(Modifier.height(12.dp))
                        OutlinedButton(onClick = onCapturePhoto, modifier = Modifier.fillMaxWidth()) {
                            Icon(Icons.Filled.CameraAlt, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text("Retake photo")
                        }
                    } else {
                        Text(
                            "No photo yet",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.height(12.dp))
                        Button(onClick = onCapturePhoto, modifier = Modifier.fillMaxWidth()) {
                            Icon(Icons.Filled.CameraAlt, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text("Capture photo")
                        }
                    }
                }
            }

            Spacer(Modifier.height(16.dp))
            Text("Personal details", style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(state.name, vm::onName, label = { Text("Full name *") }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(state.enrollmentNo, vm::onEnrollment, label = { Text("Enrollment No *") }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(state.rollNo ?: "", vm::onRollNo, label = { Text("Roll No") }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(state.dob ?: "", vm::onDob, label = { Text("DOB (YYYY-MM-DD)") }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(state.bloodGroup ?: "", vm::onBloodGroup, label = { Text("Blood Group") }, modifier = Modifier.fillMaxWidth())

            Spacer(Modifier.height(16.dp))
            Text("Family", style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(state.fatherName ?: "", vm::onFatherName, label = { Text("Father's Name") }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(state.motherName ?: "", vm::onMotherName, label = { Text("Mother's Name") }, modifier = Modifier.fillMaxWidth())

            Spacer(Modifier.height(16.dp))
            Text("Contact", style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(state.mobile ?: "", vm::onMobile, label = { Text("Mobile") }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(state.address ?: "", vm::onAddress, label = { Text("Address") }, modifier = Modifier.fillMaxWidth(), minLines = 2)

            state.error?.let {
                Spacer(Modifier.height(12.dp))
                Text(it, color = MaterialTheme.colorScheme.error)
            }

            Spacer(Modifier.height(24.dp))
            Row {
                OutlinedButton(
                    onClick = { vm.save(submit = false, onSaved) },
                    modifier = Modifier.weight(1f),
                    enabled = !state.saving,
                ) {
                    Text("Save draft")
                }
                Spacer(Modifier.width(12.dp))
                Button(
                    onClick = { vm.save(submit = true, onSaved) },
                    modifier = Modifier.weight(1f),
                    enabled = !state.saving,
                ) {
                    if (state.saving) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                    } else {
                        Text("Submit")
                    }
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}
