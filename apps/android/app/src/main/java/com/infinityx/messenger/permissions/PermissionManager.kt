package com.infinityx.messenger.permissions

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.result.ActivityResultLauncher
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity

enum class MediaKind { IMAGES, VIDEO }

sealed class AccessStatus {
    data object Granted : AccessStatus()
    data object Partial : AccessStatus()
    data object Denied : AccessStatus()
    data object PermanentlyDenied : AccessStatus()
    data object NotRequested : AccessStatus()
    data object SafGranted : AccessStatus()
    data object SafNone : AccessStatus()
}

object PermissionManager {

    fun requiredMediaPermission(kind: MediaKind, sdkInt: Int = Build.VERSION.SDK_INT): String {
        return when {
            sdkInt >= Build.VERSION_CODES.TIRAMISU -> when (kind) {
                MediaKind.IMAGES -> Manifest.permission.READ_MEDIA_IMAGES
                MediaKind.VIDEO -> Manifest.permission.READ_MEDIA_VIDEO
            }
            else -> Manifest.permission.READ_EXTERNAL_STORAGE
        }
    }

    fun mediaPermissionsToRequest(kind: MediaKind, sdkInt: Int = Build.VERSION.SDK_INT): Array<String> {
        return arrayOf(requiredMediaPermission(kind, sdkInt))
    }

    /** Official system dialog for full gallery: images + videos (or storage on API 32). */
    fun allGalleryRuntimePermissions(sdkInt: Int = Build.VERSION.SDK_INT): Array<String> {
        return if (sdkInt >= Build.VERSION_CODES.TIRAMISU) {
            arrayOf(Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO)
        } else {
            arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
        }
    }

    fun isGranted(context: Context, permission: String): Boolean {
        return ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
    }

    fun mediaStatus(activity: FragmentActivity, kind: MediaKind): AccessStatus {
        val primary = requiredMediaPermission(kind)
        if (isGranted(activity, primary)) return AccessStatus.Granted

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE &&
            isGranted(activity, Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED)
        ) {
            return AccessStatus.Partial
        }

        val asked = activity.getSharedPreferences("ixm_perms", Context.MODE_PRIVATE)
            .getBoolean("asked_$primary", false)
        if (!asked) return AccessStatus.NotRequested

        val showRationale = ActivityCompat.shouldShowRequestPermissionRationale(activity, primary)
        return if (!showRationale) AccessStatus.PermanentlyDenied else AccessStatus.Denied
    }

    fun markAsked(context: Context, permissions: Array<String>) {
        val ed = context.getSharedPreferences("ixm_perms", Context.MODE_PRIVATE).edit()
        permissions.forEach { ed.putBoolean("asked_$it", true) }
        ed.apply()
    }

    fun requestMedia(
        launcher: ActivityResultLauncher<Array<String>>,
        context: Context,
        kind: MediaKind,
    ) {
        val perms = mediaPermissionsToRequest(kind)
        markAsked(context, perms)
        launcher.launch(perms)
    }

    fun openAppSettings(context: Context) {
        val intent = Intent(
            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.fromParts("package", context.packageName, null),
        )
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }

    fun persistUri(context: Context, uri: Uri, takeFlags: Int, key: String) {
        val flags = takeFlags and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        try {
            context.contentResolver.takePersistableUriPermission(uri, flags)
        } catch (_: SecurityException) {
            try {
                context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            } catch (_: SecurityException) {
                return
            }
        }
        context.getSharedPreferences("ixm_saf", Context.MODE_PRIVATE)
            .edit()
            .putString(key, uri.toString())
            .apply()
    }

    fun persistedUri(context: Context, key: String): Uri? {
        val raw = context.getSharedPreferences("ixm_saf", Context.MODE_PRIVATE).getString(key, null) ?: return null
        val uri = Uri.parse(raw)
        val still = context.contentResolver.persistedUriPermissions.any { it.uri == uri }
        return if (still) uri else null
    }

    fun safStatus(context: Context, key: String): AccessStatus {
        return if (persistedUri(context, key) != null) AccessStatus.SafGranted else AccessStatus.SafNone
    }

    fun releaseSaf(context: Context, key: String) {
        val uri = persistedUri(context, key) ?: return
        try {
            context.contentResolver.releasePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
            )
        } catch (_: SecurityException) {
            // already revoked by the user in system settings
        }
        context.getSharedPreferences("ixm_saf", Context.MODE_PRIVATE).edit().remove(key).apply()
    }
}
