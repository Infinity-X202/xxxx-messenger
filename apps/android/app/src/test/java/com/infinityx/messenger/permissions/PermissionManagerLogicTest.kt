package com.infinityx.messenger.permissions

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

class PermissionManagerLogicTest {
    @Test
    fun android12UsesStorage() {
        assertEquals(
            "android.permission.READ_EXTERNAL_STORAGE",
            PermissionManager.requiredMediaPermission(MediaKind.IMAGES, 32),
        )
        assertArrayEquals(
            arrayOf("android.permission.READ_EXTERNAL_STORAGE"),
            PermissionManager.allGalleryRuntimePermissions(32),
        )
    }

    @Test
    fun android13UsesGranularMedia() {
        assertEquals("android.permission.READ_MEDIA_IMAGES", PermissionManager.requiredMediaPermission(MediaKind.IMAGES, 33))
        assertEquals("android.permission.READ_MEDIA_VIDEO", PermissionManager.requiredMediaPermission(MediaKind.VIDEO, 33))
        assertArrayEquals(
            arrayOf("android.permission.READ_MEDIA_IMAGES", "android.permission.READ_MEDIA_VIDEO"),
            PermissionManager.allGalleryRuntimePermissions(33),
        )
    }

    @Test
    fun android14And15SameOfficialPermissions() {
        val expected = arrayOf(
            "android.permission.READ_MEDIA_IMAGES",
            "android.permission.READ_MEDIA_VIDEO",
        )
        assertArrayEquals(expected, PermissionManager.allGalleryRuntimePermissions(34))
        assertArrayEquals(expected, PermissionManager.allGalleryRuntimePermissions(35))
    }
}
