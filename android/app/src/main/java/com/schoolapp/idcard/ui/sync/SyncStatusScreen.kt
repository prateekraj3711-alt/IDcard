package com.schoolapp.idcard.ui.sync

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.schoolapp.idcard.ui.components.BrandTopBar

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SyncStatusScreen(onBack: () -> Unit, vm: SyncStatusViewModel = hiltViewModel()) {
    val items by vm.items.collectAsState()
    Scaffold(
        topBar = {
            BrandTopBar(
                title = "Sync status",
                subtitle = "${items.size} local records",
                onNavigateBack = onBack,
                actions = {
                    TextButton(onClick = vm::retry) { Text("Retry all") }
                },
            )
        },
        containerColor = MaterialTheme.colorScheme.background,
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(items, key = { it.clientUuid }) { s ->
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
                    shape = MaterialTheme.shapes.medium,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Text(s.name, style = MaterialTheme.typography.titleMedium)
                        Text(
                            "${s.enrollmentNo} · ${s.syncStatus}${s.lastSyncError?.let { " · $it" } ?: ""}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}
