package ai.pleos.pitstop.copilot.voice

import android.content.Context

/** Pleos SDK 없이 빌드할 때: Pleos STT 없음(VoiceIO가 안드로이드 기본 인식기를 씀). */
@Suppress("UNUSED_PARAMETER")
class PleosStt(context: Context, onHeard: (String) -> Unit, onFailed: (String) -> Unit) {
    val ready: Boolean get() = false
    fun listen(timeoutMs: Long) = Unit
    fun stop() = Unit
    fun release() = Unit
    companion object { const val ENABLED = false }
}
