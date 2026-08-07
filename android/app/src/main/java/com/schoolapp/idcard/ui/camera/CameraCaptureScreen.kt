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
import coil.compose.AsyncImage
import java.io.File
import java.util.concurrent.Executor

@Composable
fun CameraCaptureScreen(studentClientUuid: String, onDone: () -> Unit) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val executor = remember { ContextCompat.getMainExecutor(context) }
    val imageCapture = remember {
        ImageCapture.Builder().setTargetRotation(android.view.Surface.ROTATION_0).build()
    }

    var capturedUri by remember { mutableStateOf<Uri?>(null) }

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
                        capture(context, executor, imageCapture, studentClientUuid) { uri ->
                            capturedUri = uri
                        }
                    },
                ) {
                    Icon(Icons.Filled.CameraAlt, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text("Capture")
                }
            }
        } else {
            // Preview + confirm / retake
            AsyncImage(
                model = capturedUri,
                contentDescription = "Preview",
                modifier = Modifier.fillMaxSize(),
            )
            Row(
                modifier = Modifier.align(Alignment.BottomCenter).padding(24.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                OutlinedButton(onClick = { capturedUri = null }) {
                    Icon(Icons.Filled.Refresh, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text("Retake")
                }
                Button(onClick = onDone) {
                    Icon(Icons.Filled.CheckCircle, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text("Use photo")
                }
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
    onCaptured: (Uri) -> Unit,
) {
    val outFile = File(ctx.cacheDir, "capture-$clientUuid.jpg")
    val opts = ImageCapture.OutputFileOptions.Builder(outFile).build()
    capture.takePicture(opts, executor, object : ImageCapture.OnImageSavedCallback {
        override fun onImageSaved(outputFileResults: ImageCapture.OutputFileResults) {
            onCaptured(Uri.fromFile(outFile))
        }
        override fun onError(exception: ImageCaptureException) { /* no-op for scaffold */ }
    })
}
