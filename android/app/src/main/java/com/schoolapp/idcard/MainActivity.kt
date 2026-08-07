package com.schoolapp.idcard

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.schoolapp.idcard.ui.auth.LoginScreen
import com.schoolapp.idcard.ui.camera.CameraCaptureScreen
import com.schoolapp.idcard.ui.students.StudentEditScreen
import com.schoolapp.idcard.ui.students.StudentListScreen
import com.schoolapp.idcard.ui.sync.SyncStatusScreen
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier) {
                    val nav = rememberNavController()
                    NavHost(navController = nav, startDestination = "login") {
                        composable("login") { LoginScreen(onSuccess = { nav.navigate("students") { popUpTo("login") { inclusive = true } } }) }
                        composable("students") {
                            StudentListScreen(
                                onAdd = { nav.navigate("student/new") },
                                onOpen = { id -> nav.navigate("student/$id") },
                                onSync = { nav.navigate("sync") },
                            )
                        }
                        composable("student/{id}") { entry ->
                            val id = entry.arguments?.getString("id") ?: "new"
                            StudentEditScreen(
                                studentClientUuid = id.takeIf { it != "new" },
                                onCapturePhoto = { nav.navigate("camera/$id") },
                                onSaved = { nav.popBackStack() },
                            )
                        }
                        composable("camera/{id}") { entry ->
                            val id = entry.arguments?.getString("id") ?: return@composable
                            CameraCaptureScreen(studentClientUuid = id, onDone = { nav.popBackStack() })
                        }
                        composable("sync") { SyncStatusScreen(onBack = { nav.popBackStack() }) }
                    }
                }
            }
        }
    }
}
