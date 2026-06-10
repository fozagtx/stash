package com.qvac.stash.share

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ShareIntentModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "StashShareIntent"

  @ReactMethod
  fun consumeSharedText(promise: Promise) {
    val payload = ShareIntentStore.consume()
    val map = Arguments.createMap()

    if (payload == null) {
      map.putBoolean("hasShare", false)
      promise.resolve(map)
      return
    }

    map.putBoolean("hasShare", true)
    map.putString("action", payload.action)
    map.putString("mimeType", payload.mimeType)
    map.putString("source", payload.source)
    map.putString("subject", payload.subject)
    map.putString("text", payload.text)
    promise.resolve(map)
  }
}
