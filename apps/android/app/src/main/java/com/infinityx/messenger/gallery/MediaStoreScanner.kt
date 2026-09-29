package com.infinityx.messenger.gallery

import android.content.ContentUris
import android.content.Context
import android.net.Uri
import android.os.Build
import android.provider.MediaStore

data class GalleryItem(
    val uri: Uri,
    val name: String,
    val mime: String,
    val size: Long,
    val relativePath: String,
)

object MediaStoreScanner {
    fun listAll(context: Context, limit: Int = 500): List<GalleryItem> {
        val out = ArrayList<GalleryItem>()
        out += query(context, MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "image/*", limit)
        if (out.size < limit) {
            out += query(context, MediaStore.Video.Media.EXTERNAL_CONTENT_URI, "video/*", limit - out.size)
        }
        return out
    }

    private fun query(context: Context, collection: Uri, fallbackMime: String, limit: Int): List<GalleryItem> {
        val items = ArrayList<GalleryItem>()
        val projection = arrayOf(
            MediaStore.MediaColumns._ID,
            MediaStore.MediaColumns.DISPLAY_NAME,
            MediaStore.MediaColumns.MIME_TYPE,
            MediaStore.MediaColumns.SIZE,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                MediaStore.MediaColumns.RELATIVE_PATH
            } else {
                MediaStore.MediaColumns.DATA
            },
        )
        val sort = "${MediaStore.MediaColumns.DATE_ADDED} DESC"
        context.contentResolver.query(collection, projection, null, null, sort)?.use { c ->
            val idCol = c.getColumnIndexOrThrow(MediaStore.MediaColumns._ID)
            val nameCol = c.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME)
            val mimeCol = c.getColumnIndexOrThrow(MediaStore.MediaColumns.MIME_TYPE)
            val sizeCol = c.getColumnIndexOrThrow(MediaStore.MediaColumns.SIZE)
            val pathCol = c.getColumnIndex(projection.last())
            while (c.moveToNext() && items.size < limit) {
                val id = c.getLong(idCol)
                val name = c.getString(nameCol) ?: "media"
                val mime = c.getString(mimeCol) ?: fallbackMime
                val size = c.getLong(sizeCol)
                val path = if (pathCol >= 0) c.getString(pathCol).orEmpty() else ""
                items += GalleryItem(
                    uri = ContentUris.withAppendedId(collection, id),
                    name = name,
                    mime = mime,
                    size = size,
                    relativePath = path.ifBlank { if (mime.startsWith("video")) "Videos" else "Photos" },
                )
            }
        }
        return items
    }
}
