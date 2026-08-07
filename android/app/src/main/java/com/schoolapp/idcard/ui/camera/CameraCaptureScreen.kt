package com.schoolapp.idcard.ui.camera

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Cameraswitch
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import java.io.File
import java.util.concurrent.Executor

@Composable
fun CameraCaptureScreen(
    studentClientUuid: String,
    onDone: () -> Unit,
    vm: CameraViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val executor = remember { ContextCompat.getMainExecutor(context) }
    val imageCapture = remember {
        ImageCapture.Builder().setTargetRotation(android.view.Surface.ROTATION_0).build()
    }

    var capturedFile by remember { mutableStateOf<File?>(null) }
    var capturedUri by remember { mutableStateOf<Uri?>(null) }
    // Default to the back camera (better sensor for ID card headshots).
    // Toggle switches between back and front for selfie enrollment.
    var useFrontCamera by remember { mutableStateOf(false) }
    val state by vm.state.collectAsState()

    // Runtime CAMERA permission. Declared in the manifest but Android 6+
    // still requires the user to grant it at runtime — without this the
    // PreviewView stays black and no image is ever captured.
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED
        )
    }
    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
        onResult = { granted -> hasCameraPermission = granted },
    )
    LaunchedEffect(Unit) {
        if (!hasCameraPermission) {
            permissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    LaunchedEffect(state.done) { if (state.done) onDone() }

    Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
        if (!hasCameraPermission) {
            Column(
                modifier = Modifier.align(Alignment.Center).padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    "Camera permission is required to take the student's photo.",
                    color = Color.White,
                    style = MaterialTheme.typography.bodyLarge,
                )
                Spacer(Modifier.height(16.dp))
                Button(onClick = { permissionLauncher.launch(Manifest.permission.CAMERA) }) {
                    Text("Grant camera access")
                }
                Spacer(Modifier.height(8.dp))
                TextButton(onClick = onDone) {
                    Text("Cancel", color = Color.White)
                }
            }
            return@Box
        }

        if (capturedUri == null) {
            AndroidView(
                factory = { ctx ->
                    PreviewView(ctx).also { preview ->
                        bindCamera(ctx, lifecycleOwner, preview, imageCapture, useFrontCamera)
                    }
                },
                update = { preview ->
                    // Re-bind whenever the selected lens flips; ProcessCameraProvider
                    // is a singleton so this is cheap.
                    bindCamera(preview.context, lifecycleOwner, preview, imageCapture, useFrontCamera)
                },
                modifier = Modifier.fillMaxSize(),
            )
            // Flip-camera pill top-right.
            IconButton(
                onClick = { useFrontCamera = !useFrontCamera },
                modifier = Modifier.align(Alignment.TopEnd).padding(16.dp),
            ) {
                Icon(
                    Icons.Filled.Cameraswitch,
                    contentDescription = if (useFrontCamera) "Switch to back camera" else "Switch to front camera",
                    tint = Color.White,
                )
            }
            Column(
                modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    if (useFrontCamera) "Selfie mode — front camera"
                    else "Frame the candidate's face in the centre",
                    color = Color.White,
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(12.dp))
                Button(
                    onClick = {
                        capture(context, executor, imageCapture, studentClientUuid) { file ->
                            capturedFile = file
                            capturedUri = Uri.fromFile(file)
                        }
                    },
                ) {
                    Icon(Icons.Filled.CameraAlt, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text("Capture")
                }
            }
        } else {
            AsyncImage(
                model = capturedUri,
                contentDescription = "Preview",
                modifier = Modifier.fillMaxSize(),
            )
            Row(
                modifier = Modifier.align(Alignment.BottomCenter).padding(24.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                OutlinedButton(
                    onClick = {
                        capturedFile = null
                        capturedUri = null
                    },
                    enabled = !state.processing,
                ) {
                    Icon(Icons.Filled.Refresh, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text("Retake")
                }
                Button(
                    onClick = { capturedFile?.let { vm.finalizePhoto(studentClientUuid, it) } },
                    enabled = !state.processing && capturedFile != null,
                ) {
                    if (state.processing) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.onPrimary,
                        )
                    } else {
                        Icon(Icons.Filled.CheckCircle, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                        Text("Use photo")
                    }
                }
            }
            state.error?.let {
                Text(
                    it,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.align(Alignment.TopCenter).padding(top = 24.dp),
                )
            }
        }
    }
}

private fun bindCamera(
    ctx: Context,
    owner: androidx.lifecycle.LifecycleOwner,
    preview: PreviewView,
    imageCapture: ImageCapture,
    useFrontCamera: Boolean = false,
) {
    val future = ProcessCameraProvider.getInstance(ctx)
    future.addListener({
        val provider = future.get()
        val previewUseCase = Preview.Builder().build().also { it.setSurfaceProvider(preview.surfaceProvider) }
        val selector = if (useFrontCamera) CameraSelector.DEFAULT_FRONT_CAMERA
        else CameraSelector.DEFAULT_BACK_CAMERA
        provider.unbindAll()
        try {
            provider.bindToLifecycle(owner, selector, previewUseCase, imageCapture)
        } catch (_: Exception) {
            // Some devices don't expose a front camera — fall back to whichever
            // is available so we never leave the user with a black preview.
            provider.bindToLifecycle(
                owner,
                CameraSelector.DEFAULT_BACK_CAMERA,
                previewUseCase,
                imageCapture,
            )
        }
    }, ContextCompat.getMainExecutor(ctx))
}

private fun capture(
    ctx: Context,
    executor: Executor,
    capture: ImageCapture,
    clientUuid: String,
    onCaptured: (File) -> Unit,
) {
    val outFile = File(ctx.cacheDir, "capture-$clientUuid.jpg")
    val opts = ImageCapture.OutputFileOptions.Builder(outFile).build()
    capture.takePicture(opts, executor, object : ImageCapture.OnImageSavedCallback {
        override fun onImageSaved(outputFileResults: ImageCapture.OutputFileResults) {
            onCaptured(outFile)
        }
        override fun onError(exception: ImageCaptureException) { /* no-op — user can retake */ }
    })
}
