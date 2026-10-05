package com.schoolapp.idcard.util

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import androidx.exifinterface.media.ExifInterface
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import android.graphics.Canvas
import android.graphics.Color
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.google.mlkit.vision.segmentation.Segmentation
import com.google.mlkit.vision.segmentation.selfie.SelfieSegmenterOptions

data class CompressedPhoto(
    val file: File,
    val sha256: String,
    val sizeBytes: Long,
    val width: Int,
    val height: Int,
)

object ImageUtil {
    /** Compress the captured JPEG to passport 3:4, ~300 KB target. */
    fun compressForUpload(source: File, outDir: File): CompressedPhoto {
        val rotated = decodeWithExifOrientation(source)
        val whitened = runCatching { whiteBackground(rotated) }.getOrDefault(rotated)
        val cropped = runCatching { passportCrop(whitened) }.getOrNull() ?: centerCrop(whitened, 3f, 4f)
        val scaled = Bitmap.createScaledBitmap(cropped, 720, 960, true)
        val out = File(outDir, "photo-${System.currentTimeMillis()}.jpg")

        var quality = 85
        while (quality >= 50) {
            FileOutputStream(out).use { fos -> scaled.compress(Bitmap.CompressFormat.JPEG, quality, fos) }
            if (out.length() <= 400 * 1024) break
            quality -= 10
        }

        return CompressedPhoto(
            file = out,
            sha256 = sha256(out),
            sizeBytes = out.length(),
            width = scaled.width,
            height = scaled.height,
        )
    }

    /** Head-and-shoulders 3:4 crop around the largest face (blocking; call off the main thread). */
    private fun passportCrop(src: Bitmap): Bitmap? {
        val det = FaceDetection.getClient(
            FaceDetectorOptions.Builder().setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_ACCURATE).build()
        )
        val faces = try { Tasks.await(det.process(InputImage.fromBitmap(src, 0))) } finally { det.close() }
        val f = faces.maxByOrNull { it.boundingBox.width() * it.boundingBox.height() }?.boundingBox ?: return null
        var h = f.height() * 2.3f
        var w = h * 3f / 4f
        if (w > src.width) { w = src.width.toFloat(); h = w * 4f / 3f }
        if (h > src.height) { h = src.height.toFloat(); w = h * 3f / 4f }
        val x = (f.exactCenterX() - w / 2f).coerceIn(0f, src.width - w)
        val y = (f.top - f.height() * 0.6f).coerceIn(0f, src.height - h)
        return Bitmap.createBitmap(src, x.toInt(), y.toInt(), w.toInt(), h.toInt())
    }

    /** Replace everything except the person with plain white. */
    private fun whiteBackground(src: Bitmap): Bitmap {
        val seg = Segmentation.getClient(
            SelfieSegmenterOptions.Builder().setDetectorMode(SelfieSegmenterOptions.SINGLE_IMAGE_MODE).build()
        )
        val mask = try { Tasks.await(seg.process(InputImage.fromBitmap(src, 0))) } finally { seg.close() }
        val mw = mask.width; val mh = mask.height
        val buf = mask.buffer.apply { rewind() }
        val conf = FloatArray(mw * mh) { buf.float }
        val base = if (src.config == Bitmap.Config.ARGB_8888) src else src.copy(Bitmap.Config.ARGB_8888, false)
        val small = Bitmap.createScaledBitmap(base, mw, mh, true)
        val px = IntArray(mw * mh)
        small.getPixels(px, 0, mw, 0, 0, mw, mh)
        for (i in px.indices) {
            val a = ((conf[i] - 0.3f) / 0.4f).coerceIn(0f, 1f)
            val c = px[i]
            fun mix(v: Int) = (v * a + 255 * (1 - a)).toInt()
            px[i] = Color.rgb(mix(Color.red(c)), mix(Color.green(c)), mix(Color.blue(c)))
        }
        val out = Bitmap.createBitmap(mw, mh, Bitmap.Config.ARGB_8888)
        out.setPixels(px, 0, mw, 0, 0, mw, mh)
        // Upscale back to the original size on a white canvas.
        val full = Bitmap.createBitmap(src.width, src.height, Bitmap.Config.ARGB_8888)
        Canvas(full).apply { drawColor(Color.WHITE); drawBitmap(Bitmap.createScaledBitmap(out, src.width, src.height, true), 0f, 0f, null) }
        return full
    }

    private fun decodeWithExifOrientation(source: File): Bitmap {
        val bmp = BitmapFactory.decodeFile(source.absolutePath)
        val exif = ExifInterface(source.absolutePath)
        val orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        val degrees = when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> 90f
            ExifInterface.ORIENTATION_ROTATE_180 -> 180f
            ExifInterface.ORIENTATION_ROTATE_270 -> 270f
            else -> 0f
        }
        if (degrees == 0f) return bmp
        val m = Matrix().apply { postRotate(degrees) }
        return Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
    }

    private fun centerCrop(src: Bitmap, ratioW: Float, ratioH: Float): Bitmap {
        val target = ratioW / ratioH
        val srcRatio = src.width.toFloat() / src.height
        return if (srcRatio > target) {
            val newW = (src.height * target).toInt()
            Bitmap.createBitmap(src, (src.width - newW) / 2, 0, newW, src.height)
        } else {
            val newH = (src.width / target).toInt()
            Bitmap.createBitmap(src, 0, (src.height - newH) / 2, src.width, newH)
        }
    }

    private fun sha256(file: File): String {
        val md = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buf = ByteArray(8192)
            while (true) {
                val n = input.read(buf); if (n <= 0) break
                md.update(buf, 0, n)
            }
        }
        return md.digest().joinToString("") { "%02x".format(it) }
    }
}
