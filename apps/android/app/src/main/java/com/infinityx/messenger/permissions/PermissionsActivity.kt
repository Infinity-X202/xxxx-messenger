package com.infinityx.messenger.permissions

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.DocumentsContract
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.infinityx.messenger.R
import com.infinityx.messenger.databinding.ActivityPermissionsBinding

class PermissionsActivity : AppCompatActivity() {

    private lateinit var binding: ActivityPermissionsBinding

    private val requestImages = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { refreshUi() }

    private val requestVideos = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { refreshUi() }

    private val openDocument = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        val uri = result.data?.data ?: return@registerForActivityResult
        val takeFlags = result.data?.flags ?: Intent.FLAG_GRANT_READ_URI_PERMISSION
        PermissionManager.persistUri(this, uri, takeFlags, KEY_FILE)
        refreshUi()
        Toast.makeText(this, getString(R.string.file_granted), Toast.LENGTH_SHORT).show()
    }

    private val openTree = registerForActivityResult(
        ActivityResultContracts.OpenDocumentTree(),
    ) { uri ->
        if (uri == null) return@registerForActivityResult
        PermissionManager.persistUri(
            this,
            uri,
            Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
            KEY_TREE,
        )
        refreshUi()
        Toast.makeText(this, getString(R.string.folder_granted), Toast.LENGTH_SHORT).show()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityPermissionsBinding.inflate(layoutInflater)
        setContentView(binding.root)
        setSupportActionBar(binding.toolbar)

        binding.photosGrant.setOnClickListener { grantMedia(MediaKind.IMAGES) }
        binding.videosGrant.setOnClickListener { grantMedia(MediaKind.VIDEO) }
        binding.photosManage.setOnClickListener { PermissionManager.openAppSettings(this) }
        binding.videosManage.setOnClickListener { PermissionManager.openAppSettings(this) }

        binding.filesGrant.setOnClickListener {
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "*/*"
                addFlags(
                    Intent.FLAG_GRANT_READ_URI_PERMISSION or
                        Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION,
                )
            }
            openDocument.launch(intent)
        }
        binding.filesManage.setOnClickListener {
            val uri = PermissionManager.persistedUri(this, KEY_FILE)
            if (uri != null) openSafDocument(uri) else PermissionManager.openAppSettings(this)
        }

        binding.foldersGrant.setOnClickListener {
            openTree.launch(null)
        }
        binding.foldersManage.setOnClickListener {
            val uri = PermissionManager.persistedUri(this, KEY_TREE)
            if (uri != null) openSafTree(uri) else PermissionManager.openAppSettings(this)
        }
    }

    override fun onResume() {
        super.onResume()
        refreshUi()
    }

    private fun grantMedia(kind: MediaKind) {
        val status = PermissionManager.mediaStatus(this, kind)
        if (status is AccessStatus.Granted) {
            Toast.makeText(this, R.string.already_granted, Toast.LENGTH_SHORT).show()
            return
        }
        if (status is AccessStatus.PermanentlyDenied) {
            PermissionManager.openAppSettings(this)
            return
        }
        val launcher = if (kind == MediaKind.IMAGES) requestImages else requestVideos
        PermissionManager.requestMedia(launcher, this, kind)
    }

    private fun openSafDocument(uri: Uri) {
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, contentResolver.getType(uri) ?: "*/*")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        runCatching { startActivity(intent) }
    }

    private fun openSafTree(uri: Uri) {
        val intent = Intent(Intent.ACTION_VIEW).apply {
            data = DocumentsContract.buildDocumentUriUsingTree(
                uri,
                DocumentsContract.getTreeDocumentId(uri),
            )
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        runCatching { startActivity(intent) }
    }

    private fun refreshUi() {
        bindMedia(MediaKind.IMAGES, binding.photosStatus, binding.photosManage)
        bindMedia(MediaKind.VIDEO, binding.videosStatus, binding.videosManage)
        bindSaf(KEY_FILE, binding.filesStatus, binding.filesManage, isFolder = false)
        bindSaf(KEY_TREE, binding.foldersStatus, binding.foldersManage, isFolder = true)
    }

    private fun bindMedia(
        kind: MediaKind,
        statusView: android.widget.TextView,
        manage: android.view.View,
    ) {
        val status = PermissionManager.mediaStatus(this, kind)
        statusView.text = when (status) {
            AccessStatus.Granted -> getString(R.string.status_granted)
            AccessStatus.Partial -> getString(R.string.status_partial)
            AccessStatus.Denied -> getString(R.string.status_denied)
            AccessStatus.PermanentlyDenied -> getString(R.string.status_denied_permanent)
            AccessStatus.NotRequested -> getString(R.string.status_not_requested)
            else -> getString(R.string.status_not_requested)
        }
        manage.visibility = if (
            status is AccessStatus.Granted ||
            status is AccessStatus.Partial ||
            status is AccessStatus.PermanentlyDenied
        ) android.view.View.VISIBLE else android.view.View.GONE
    }

    private fun bindSaf(key: String, statusView: android.widget.TextView, manage: android.view.View, isFolder: Boolean) {
        val granted = PermissionManager.safStatus(this, key) is AccessStatus.SafGranted
        statusView.text = if (granted) {
            getString(if (isFolder) R.string.status_folder_granted else R.string.status_file_granted)
        } else {
            getString(R.string.status_saf_none)
        }
        manage.visibility = if (granted) android.view.View.VISIBLE else android.view.View.GONE
    }

    companion object {
        private const val KEY_FILE = "saf_file"
        private const val KEY_TREE = "saf_tree"
    }
}
