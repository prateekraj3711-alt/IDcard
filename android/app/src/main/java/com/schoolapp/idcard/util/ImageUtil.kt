package com.schoolapp.idcard.util

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import androidx.exifinterface.media.ExifInterface
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest

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
        val cropped = centerCrop(rotated, 3f, 4f)
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
