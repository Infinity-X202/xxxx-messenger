package com.infinityx.messenger

import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import androidx.appcompat.app.AppCompatActivity

class SettingsActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)
        val input = findViewById<EditText>(R.id.siteUrl)
        val prefs = getSharedPreferences("ixm", MODE_PRIVATE)
        input.setText(prefs.getString("site_url", BuildConfig.SITE_URL))
        findViewById<Button>(R.id.save).setOnClickListener {
            val url = input.text.toString().trim().trimEnd('/')
            if (url.startsWith("http://") || url.startsWith("https://")) {
                prefs.edit().putString("site_url", url).apply()
                setResult(RESULT_OK)
                finish()
            } else {
                input.error = getString(R.string.site_url_hint)
            }
        }
    }
}
