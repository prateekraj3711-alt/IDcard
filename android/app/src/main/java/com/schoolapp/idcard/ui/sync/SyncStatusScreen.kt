package com.schoolapp.idcard.ui.sync

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SyncStatusScreen(onBack: () -> Unit, vm: SyncStatusViewModel = hiltViewModel()) {
    val items by vm.items.collectAsState()
    Scaffold(topBar = {
        TopAppBar(
            title = { Text("Sync") },
            actions = { TextButton(onClick = vm::retry) { Text("Retry all") } },
        )
    }) { padding ->
        LazyColumn(modifier = Modifier.padding(padding).fillMaxSize()) {
            items(items, key = { it.clientUuid }) { s ->
                ListItem(
                    headlineContent = { Text(s.name) },
                    supportingContent = { Text("${s.syncStatus} • ${s.lastSyncError ?: ""}") },
                    modifier = Modifier.padding(horizontal = 8.dp),
                )
                HorizontalDivider()
            }
        }
    }
}
