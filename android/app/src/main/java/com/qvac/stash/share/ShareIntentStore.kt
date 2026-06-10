package com.qvac.stash.share

import android.content.Context
import android.content.Intent

data class SharedPayload(
  val action: String?,
  val mimeType: String?,
  val source: String?,
  val subject: String?,
  val text: String
)

object ShareIntentStore {
  private var pendingPayload: SharedPayload? = null

  @Synchronized
  fun ingest(context: Context, intent: Intent?) {
    if (intent == null) return

    val action = intent.action
    if (action != Intent.ACTION_SEND && action != Intent.ACTION_PROCESS_TEXT) return

    val mimeType = intent.type
    if (mimeType != null && !mimeType.startsWith("text/")) return

    val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)
    val text = firstNonBlank(
      intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString(),
      intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString(),
      intent.clipData?.getItemAt(0)?.coerceToText(context)?.toString()
    )

    if (text == null) return

    pendingPayload = SharedPayload(
      action = action,
      mimeType = mimeType,
      source = intent.`package`,
      subject = subject,
      text = text
    )
  }

  @Synchronized
  fun consume(): SharedPayload? {
    val value = pendingPayload
    pendingPayload = null
    return value
  }

  private fun firstNonBlank(vararg values: String?): String? {
    return values.firstOrNull { !it.isNullOrBlank() }?.trim()
  }
}
