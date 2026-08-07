package com.schoolapp.idcard.ui.camera

import android.content.Context
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import java.io.File
import java.util.concurrent.Executor

@Composable
fun CameraCaptureScreen(studentClientUuid: String, onDone: () -> Unit) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val executor = remember { ContextCompat.getMainExecutor(context) }
    val imageCapture = remember { ImageCapture.Builder().setTargetRotation(android.view.Surface.ROTATION_0).build() }

    Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
        AndroidView(
            factory = { ctx ->
                val previewView = PreviewView(ctx)
                bindCamera(ctx, lifecycleOwner, previewView, imageCapture)
                previewView
            },
            modifier = Modifier.fillMaxSize(),
        )
        Button(
            onClick = { capture(context, executor, imageCapture, studentClientUuid, onDone) },
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 24.dp),
        ) {
            Text("Capture")
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
        val selector = CameraSelector.DEFAULT_FRONT_CAMERA
        provider.unbindAll()
        provider.bindToLifecycle(owner, selector, previewUseCase, imageCapture)
    }, ContextCompat.getMainExecutor(ctx))
}

private fun capture(
    ctx: Context,
    executor: Executor,
    capture: ImageCapture,
    clientUuid: String,
    onDone: () -> Unit,
) {
    val outFile = File(ctx.cacheDir, "capture-$clientUuid.jpg")
    val opts = ImageCapture.OutputFileOptions.Builder(outFile).build()
    capture.takePicture(opts, executor, object : ImageCapture.OnImageSavedCallback {
        override fun onImageSaved(outputFileResults: ImageCapture.OutputFileResults) {
            // In production: pass outFile to a ViewModel that compresses via ImageUtil and enqueues UploadPhotoWorker.
            onDone()
        }
        override fun onError(exception: ImageCaptureException) { onDone() }
    })
}
