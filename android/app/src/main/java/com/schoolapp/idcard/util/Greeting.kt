package com.schoolapp.idcard.util

import android.content.Context
import androidx.core.content.edit
import java.util.Calendar
import java.util.concurrent.TimeUnit

private const val PREFS = "greeting"
private const val KEY_LAST_SEEN = "last_seen_millis"

/**
 * Returns a friendly time-of-day greeting.
 *   00–04 → "Good night"
 *   05–11 → "Good morning"
 *   12–16 → "Good afternoon"
 *   17–20 → "Good evening"
 *   21–23 → "Good night"
 *
 * If the user hasn't opened the app for at least [longAbsenceHours],
 * "Welcome back" is prepended.
 */
fun buildGreeting(context: Context, name: String? = null, longAbsenceHours: Long = 72): String {
    val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
    val greeting = when (hour) {
        in 5..11 -> "Good morning"
        in 12..16 -> "Good afternoon"
        in 17..20 -> "Good evening"
        else -> "Good night"
    }

    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val now = System.currentTimeMillis()
    val last = prefs.getLong(KEY_LAST_SEEN, 0L)
    val absent = last == 0L || (now - last) >= TimeUnit.HOURS.toMillis(longAbsenceHours)
    prefs.edit { putLong(KEY_LAST_SEEN, now) }

    val nameSuffix = if (!name.isNullOrBlank()) ", ${name.trim().split(" ").first()}" else ""
    return if (absent) "Welcome back$nameSuffix — $greeting!" else "Hi$nameSuffix! $greeting."
}
