package com.infinityx.messenger

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

object OtaChecker {
    fun check(activity: MainActivity, origin: String, force: Boolean = false) {
        Thread {
            try {
                val conn = URL("$origin/api/v1/app/latest").openConnection() as HttpURLConnection
                conn.connectTimeout = 8000
                conn.readTimeout = 8000
                val body = conn.inputStream.bufferedReader().readText()
                conn.disconnect()
                val json = JSONObject(body)
                if (!json.optBoolean("available", false)) {
                    if (force) activity.runOnUiThread {
                        Toast.makeText(activity, R.string.ota_latest, Toast.LENGTH_SHORT).show()
                    }
                    return@Thread
                }
                val code = json.optInt("versionCode", 0)
                if (code <= BuildConfig.VERSION_CODE) {
                    if (force) activity.runOnUiThread {
                        Toast.makeText(activity, R.string.ota_latest, Toast.LENGTH_SHORT).show()
                    }
                    return@Thread
                }
                val notes = json.optString("notes", "Nuovo aggiornamento")
                val name = json.optString("versionName", code.toString())
                activity.runOnUiThread { prompt(activity, origin, name, notes) }
            } catch (_: Exception) {
                if (force) activity.runOnUiThread {
                    Toast.makeText(activity, R.string.offline_title, Toast.LENGTH_SHORT).show()
                }
            }
        }.start()
    }

    private fun prompt(activity: MainActivity, origin: String, version: String, notes: String) {
        AlertDialog.Builder(activity)
            .setTitle("Aggiornamento $version")
            .setMessage(notes)
            .setNegativeButton("Più tardi", null)
            .setPositiveButton("Aggiorna") { _, _ -> download(activity, origin) }
            .show()
    }

    private fun download(activity: MainActivity, origin: String) {
        val uri = Uri.parse("$origin/api/v1/app/download")
        try {
            val dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
            if (dir != null) File(dir, "InfinityX.apk").delete()
            val dm = activity.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            val req = DownloadManager.Request(uri)
                .setTitle("Infinity X")
                .setDescription("Download aggiornamento")
                .setMimeType("application/vnd.android.package-archive")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalFilesDir(activity, Environment.DIRECTORY_DOWNLOADS, "InfinityX.apk")
            val id = dm.enqueue(req)
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context, intent: Intent) {
                    val done = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1)
                    if (done != id) return
                    activity.unregisterReceiver(this)
                    install(activity)
                }
            }
            ContextCompat.registerReceiver(
                activity,
                receiver,
                IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
                ContextCompat.RECEIVER_NOT_EXPORTED,
            )
            Toast.makeText(activity, "Download aggiornamento…", Toast.LENGTH_SHORT).show()
        } catch (_: Exception) {
            activity.startActivity(Intent(Intent.ACTION_VIEW, uri))
        }
    }

    private fun install(activity: MainActivity) {
        val apk = File(activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "InfinityX.apk")
        if (!apk.exists()) return
        val apkUri = FileProvider.getUriForFile(activity, "${activity.packageName}.files", apk)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(apkUri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            }
        }
        activity.startActivity(intent)
    }
}
