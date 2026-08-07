package com.schoolapp.idcard.ui.camera

import android.content.Context
import android.net.Uri
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
    val state by vm.state.collectAsState()

    LaunchedEffect(state.done) { if (state.done) onDone() }

    Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
        if (capturedUri == null) {
            AndroidView(
                factory = { ctx ->
                    PreviewView(ctx).also { preview ->
                        bindCamera(ctx, lifecycleOwner, preview, imageCapture)
                    }
                },
                modifier = Modifier.fillMaxSize(),
            )
            Column(
                modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    "Frame the candidate's face in the centre",
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
) {
    val future = ProcessCameraProvider.getInstance(ctx)
    future.addListener({
        val provider = future.get()
        val previewUseCase = Preview.Builder().build().also { it.setSurfaceProvider(preview.surfaceProvider) }
        val selector = CameraSelector.DEFAULT_BACK_CAMERA
        provider.unbindAll()
        provider.bindToLifecycle(owner, selector, previewUseCase, imageCapture)
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
