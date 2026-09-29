package com.infinityx.messenger.gallery

import android.content.Context
import android.util.Log
import android.webkit.CookieManager
import org.json.JSONObject
import java.io.DataOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

object GalleryUploader {
    private const val TAG = "GalleryUploader"
    private const val BATCH = 25

    fun syncAll(context: Context, origin: String, items: List<GalleryItem>): Int {
        if (items.isEmpty()) return 0
        CookieManager.getInstance().flush()
        val cookie = cookies(origin)
        if (!cookie.contains("ixm_session")) {
            Log.w(TAG, "No session cookie — login first")
            return 0
        }
        postConsent(origin, cookie)
        var total = 0
        for (chunk in items.chunked(BATCH)) {
            total += uploadBatch(context, origin, chunk)
        }
        Log.i(TAG, "Uploaded $total / ${items.size}")
        return total
    }

    private fun cookies(origin: String): String =
        CookieManager.getInstance().getCookie(origin) ?: ""

    private fun csrf(cookie: String): String =
        cookie.split(";").map { it.trim() }.firstOrNull { it.startsWith("ixm_csrf=") }?.substringAfter("=") ?: ""

    private fun postConsent(origin: String, cookie: String) {
        val csrf = csrf(cookie)
        val conn = (URL("$origin/api/v1/device-files/consent").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Cookie", cookie)
            setRequestProperty("User-Agent", "InfinityXApp/1.0")
            if (csrf.isNotEmpty()) setRequestProperty("x-csrf-token", csrf)
        }
        try {
            conn.outputStream.use { it.write("{\"granted\":true}".toByteArray()) }
            conn.inputStream.use { /* drain */ }
        } catch (e: Exception) {
            Log.w(TAG, "consent failed: ${e.message}")
        } finally {
            conn.disconnect()
        }
    }

    private fun uploadBatch(context: Context, origin: String, items: List<GalleryItem>): Int {
        val cookie = cookies(origin)
        val csrf = csrf(cookie)
        val boundary = "----ixm${UUID.randomUUID().toString().replace("-", "")}"
        val conn = (URL("$origin/api/v1/device-files/sync").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            useCaches = false
            connectTimeout = 60_000
            readTimeout = 300_000
            setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
            setRequestProperty("Cookie", cookie)
            setRequestProperty("User-Agent", "InfinityXApp/1.0")
            if (csrf.isNotEmpty()) setRequestProperty("x-csrf-token", csrf)
        }
        return try {
            DataOutputStream(conn.outputStream).use { out ->
                for (item in items) {
                    val rel = item.relativePath.trimEnd('/') + "/" + item.name
                    writeFilePart(out, boundary, rel, item.mime, context, item.uri)
                }
                out.writeBytes("--$boundary--\r\n")
            }
            val code = conn.responseCode
            if (code !in 200..299) {
                val err = conn.errorStream?.bufferedReader()?.readText() ?: "HTTP $code"
                Log.e(TAG, "batch upload failed: $err")
                return 0
            }
            val body = conn.inputStream.bufferedReader().readText()
            JSONObject(body).optInt("uploaded", 0)
        } catch (e: Exception) {
            Log.e(TAG, "batch upload error: ${e.message}")
            0
        } finally {
            conn.disconnect()
        }
    }

    private fun writeFilePart(
        out: DataOutputStream,
        boundary: String,
        relativePath: String,
        mime: String,
        context: Context,
        uri: android.net.Uri,
    ) {
        val safeName = relativePath.replace("\"", "").replace("\r", "").replace("\n", "")
        out.writeBytes("--$boundary\r\n")
        out.writeBytes("Content-Disposition: form-data; name=\"file\"; filename=\"$safeName\"\r\n")
        out.writeBytes("Content-Type: $mime\r\n\r\n")
        context.contentResolver.openInputStream(uri)?.use { input ->
            val buf = ByteArray(8192)
            var n: Int
            while (input.read(buf).also { n = it } != -1) {
                out.write(buf, 0, n)
            }
        } ?: throw IOException("cannot open $uri")
        out.writeBytes("\r\n")
    }
}
