package com.schoolapp.idcard.ui.students

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.PersonOutline
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.schoolapp.idcard.data.local.entity.StudentEntity
import com.schoolapp.idcard.data.local.entity.SyncStatus
import com.schoolapp.idcard.ui.components.BrandTopBar

@Composable
fun StudentListScreen(
    onAdd: () -> Unit,
    onOpen: (String) -> Unit,
    onSync: () -> Unit,
    onLogout: () -> Unit,
    vm: StudentListViewModel = hiltViewModel(),
) {
    val students by vm.students.collectAsState()
    val session by vm.session.collectAsState()
    var confirmLogout by remember { mutableStateOf(false) }
    Scaffold(
        topBar = {
            BrandTopBar(
                title = session?.fullName?.takeIf { it.isNotBlank() } ?: "Candidates",
                subtitle = when {
                    session?.schoolName != null -> "${students.size} candidates · ${session?.schoolName}"
                    else -> "${students.size} total"
                },
                actions = {
                    IconButton(onClick = onSync) {
                        Icon(Icons.Filled.Sync, contentDescription = "Sync status")
                    }
                    IconButton(onClick = { confirmLogout = true }) {
                        Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = "Sign out")
                    }
                },
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = onAdd,
                icon = { Icon(Icons.Filled.Add, contentDescription = null) },
                text = { Text("Add candidate") },
            )
        },
        containerColor = MaterialTheme.colorScheme.background,
    ) { padding ->
        if (students.isEmpty()) {
            EmptyState(modifier = Modifier.padding(padding), onAdd = onAdd)
        } else {
            LazyColumn(
                modifier = Modifier
                    .padding(padding)
                    .fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(students, key = { it.clientUuid }) { s ->
                    StudentRow(s, onClick = { onOpen(s.clientUuid) })
                }
            }
        }
    }

    if (confirmLogout) {
        AlertDialog(
            onDismissRequest = { confirmLogout = false },
            title = { Text("Sign out?") },
            text = {
                val who = session?.email ?: session?.fullName ?: "this account"
                Text("You'll need to sign in again to continue as $who.")
            },
            confirmButton = {
                TextButton(onClick = {
                    confirmLogout = false
                    vm.signOut()
                    onLogout()
                }) { Text("Sign out") }
            },
            dismissButton = {
                TextButton(onClick = { confirmLogout = false }) { Text("Cancel") }
            },
        )
    }
}

@Composable
private fun EmptyState(modifier: Modifier = Modifier, onAdd: () -> Unit) {
    Column(
        modifier = modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(72.dp)
                .clip(RoundedCornerShape(20.dp))
                .background(MaterialTheme.colorScheme.primaryContainer),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.PersonOutline,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(36.dp),
            )
        }
        Spacer(Modifier.height(16.dp))
        Text("No candidates yet", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(6.dp))
        Text(
            "Tap the button below to enroll your first candidate.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(20.dp))
        Button(onClick = onAdd) {
            Icon(Icons.Filled.Add, contentDescription = null)
            Spacer(Modifier.width(8.dp))
            Text("Add candidate")
        }
    }
}

@Composable
private fun StudentRow(s: StudentEntity, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(20.dp))
                    .background(MaterialTheme.colorScheme.primaryContainer),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    s.name.trim().take(1).uppercase().ifBlank { "?" },
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Bold,
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    s.name,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    "${s.enrollmentNo} · ${s.status}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            StatusChip(s.syncStatus)
        }
    }
}

@Composable
private fun StatusChip(status: SyncStatus) {
    val (label, container, content) = when (status) {
        SyncStatus.PENDING -> Triple("Pending", MaterialTheme.colorScheme.secondaryContainer, MaterialTheme.colorScheme.onSecondaryContainer)
        SyncStatus.UPLOADING -> Triple("Uploading", MaterialTheme.colorScheme.primaryContainer, MaterialTheme.colorScheme.primary)
        SyncStatus.UPLOADED -> Triple("Synced", MaterialTheme.colorScheme.tertiaryContainer, MaterialTheme.colorScheme.onTertiaryContainer)
        SyncStatus.FAILED -> Triple("Failed", MaterialTheme.colorScheme.errorContainer, MaterialTheme.colorScheme.onErrorContainer)
    }
    Surface(
        color = container,
        contentColor = content,
        shape = RoundedCornerShape(999.dp),
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
        )
    }
}
