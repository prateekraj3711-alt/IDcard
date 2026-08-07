package com.schoolapp.idcard.ui.students

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

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

    Scaffold(topBar = { TopAppBar(title = { Text("Student") }) }) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState())
                .fillMaxSize(),
        ) {
            OutlinedTextField(state.name, vm::onName, label = { Text("Name *") }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(state.enrollmentNo, vm::onEnrollment, label = { Text("Enrollment No *") }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(state.rollNo ?: "", vm::onRollNo, label = { Text("Roll No") }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(state.fatherName ?: "", vm::onFatherName, label = { Text("Father's Name") }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(state.motherName ?: "", vm::onMotherName, label = { Text("Mother's Name") }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(state.dob ?: "", vm::onDob, label = { Text("DOB (YYYY-MM-DD)") }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(state.bloodGroup ?: "", vm::onBloodGroup, label = { Text("Blood Group") }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(state.mobile ?: "", vm::onMobile, label = { Text("Mobile") }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(state.address ?: "", vm::onAddress, label = { Text("Address") }, modifier = Modifier.fillMaxWidth(), minLines = 2)

            Spacer(Modifier.height(16.dp))
            OutlinedButton(onClick = onCapturePhoto, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Filled.CameraAlt, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text(if (state.hasPhoto) "Retake photo" else "Capture photo")
            }

            Spacer(Modifier.height(16.dp))
            Row {
                OutlinedButton(onClick = { vm.save(submit = false, onSaved) }, modifier = Modifier.weight(1f)) {
                    Text("Save draft")
                }
                Spacer(Modifier.width(12.dp))
                Button(onClick = { vm.save(submit = true, onSaved) }, modifier = Modifier.weight(1f)) {
                    Text("Submit")
                }
            }
            state.error?.let {
                Spacer(Modifier.height(12.dp))
                Text(it, color = MaterialTheme.colorScheme.error)
            }
        }
    }
}
