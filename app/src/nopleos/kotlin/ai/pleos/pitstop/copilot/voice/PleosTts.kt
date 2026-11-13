package ai.pleos.pitstop.copilot.voice

import android.content.Context

/** Pleos SDK 없이 빌드할 때: Pleos TTS 없음. */
@Suppress("UNUSED_PARAMETER")
class PleosTts(context: Context, onDone: () -> Unit) {
    val available: Boolean get() = false
    fun speak(text: String): Boolean = false
    fun stop() = Unit
    fun release() = Unit
}
