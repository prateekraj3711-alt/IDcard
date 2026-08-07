package com.schoolapp.idcard.ui.students

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.schoolapp.idcard.data.local.entity.SyncStatus

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StudentListScreen(
    onAdd: () -> Unit,
    onOpen: (String) -> Unit,
    onSync: () -> Unit,
    vm: StudentListViewModel = hiltViewModel(),
) {
    val students by vm.students.collectAsState()
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Students (${students.size})") },
                actions = {
                    IconButton(onClick = onSync) { Icon(Icons.Filled.Sync, contentDescription = "Sync") }
                },
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = onAdd) { Icon(Icons.Filled.Add, contentDescription = "Add") }
        },
    ) { padding ->
        LazyColumn(modifier = Modifier.padding(padding).fillMaxSize()) {
            items(students, key = { it.clientUuid }) { s ->
                ListItem(
                    headlineContent = { Text(s.name) },
                    supportingContent = { Text("${s.enrollmentNo} • ${s.status}") },
                    trailingContent = { StatusChip(s.syncStatus) },
                    modifier = Modifier.padding(horizontal = 8.dp),
                )
                HorizontalDivider()
            }
        }
    }
}

@Composable
private fun StatusChip(status: SyncStatus) {
    val (label, color) = when (status) {
        SyncStatus.PENDING   -> "Pending" to MaterialTheme.colorScheme.tertiary
        SyncStatus.UPLOADING -> "Uploading" to MaterialTheme.colorScheme.primary
        SyncStatus.UPLOADED  -> "Uploaded" to MaterialTheme.colorScheme.secondary
        SyncStatus.FAILED    -> "Failed" to MaterialTheme.colorScheme.error
    }
    AssistChip(onClick = {}, label = { Text(label) }, colors = AssistChipDefaults.assistChipColors(labelColor = color))
}
