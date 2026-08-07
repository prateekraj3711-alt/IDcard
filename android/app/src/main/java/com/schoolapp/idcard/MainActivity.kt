package com.schoolapp.idcard

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.schoolapp.idcard.data.remote.TokenStore
import com.schoolapp.idcard.ui.auth.LoginScreen
import com.schoolapp.idcard.ui.auth.SignupScreen
import com.schoolapp.idcard.ui.camera.CameraCaptureScreen
import com.schoolapp.idcard.ui.students.StudentEditScreen
import com.schoolapp.idcard.ui.students.StudentListScreen
import com.schoolapp.idcard.ui.sync.SyncStatusScreen
import com.schoolapp.idcard.ui.theme.StarkTheme
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject lateinit var tokens: TokenStore

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        // Resume from persisted session — if the teacher is already signed in,
        // skip the login screen entirely and land on the candidate list.
        val startDestination = if (tokens.hasSession()) "students" else "login"
        setContent {
            StarkTheme {
                Surface(modifier = Modifier) {
                    val nav = rememberNavController()
                    NavHost(navController = nav, startDestination = startDestination) {
                        composable("login") {
                            LoginScreen(
                                onSuccess = {
                                    nav.navigate("students") { popUpTo("login") { inclusive = true } }
                                },
                                onSignUp = { nav.navigate("signup") },
                            )
                        }
                        composable("signup") {
                            SignupScreen(
                                onSuccess = {
                                    nav.navigate("students") {
                                        popUpTo("login") { inclusive = true }
                                    }
                                },
                                onBackToLogin = { nav.popBackStack() },
                            )
                        }
                        composable("students") {
                            StudentListScreen(
                                onAdd = { nav.navigate("student/new") },
                                onOpen = { id -> nav.navigate("student/$id") },
                                onSync = { nav.navigate("sync") },
                                onLogout = {
                                    nav.navigate("login") {
                                        popUpTo(0) { inclusive = true }
                                    }
                                },
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
