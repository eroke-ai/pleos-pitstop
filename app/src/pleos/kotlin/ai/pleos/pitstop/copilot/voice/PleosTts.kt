package ai.pleos.pitstop.copilot.voice

import ai.pleos.playground.tts.TextToSpeech
import ai.pleos.playground.tts.constant.ErrorType
import ai.pleos.playground.tts.constant.Mode
import ai.pleos.playground.tts.listener.EventListener
import ai.pleos.playground.tts.listener.OnInitializeListener
import android.content.Context
import android.util.Log
import java.util.Locale

/**
 * Pleos TTS SDK 3.3.1. Pleos Connect에는 안드로이드 기본 TTS 엔진이 없어(기본 엔진 null, 초기화 -1)
 * 표준 TextToSpeech가 실패할 때 이 경로로 말합니다. ON_DEVICE 모드로 앱 키 없이 시도합니다.
 */
class PleosTts(context: Context, private val finished: () -> Unit) {
    @Volatile var available = false; private set
    private val pending = ArrayList<String>()
    private val tts = runCatching { TextToSpeech(context.applicationContext, Mode.ON_DEVICE) }
        .onFailure { Log.w(TAG, "Pleos TTS create failed", it) }.getOrNull()

    /** 말이 끝나거나 멈추면 오디오 포커스를 돌려줘 음악 볼륨이 원래대로 돌아오게 합니다. */
    private val events = object : EventListener {
        override fun onStart() = Unit
        override fun onReady() = Unit
        override fun onDone() = finished()
        override fun onError(p0: ErrorType) { Log.w(TAG, "speak error: $p0"); finished() }
        override fun onStop() = finished()
        override fun onUpdatedRms(p0: Double) = Unit
    }

    init {
        runCatching {
            tts?.initialize(object : OnInitializeListener {
                override fun onSuccess() {
                    Log.i(TAG, "Pleos TTS ready")
                    runCatching { tts?.setLocale(Locale.KOREA) }
                    runCatching { tts.addEventListener(events) }
                    available = true
                    synchronized(pending) { pending.forEach { speak(it) }; pending.clear() }
                }
                override fun onFailure(p0: ErrorType) { Log.w(TAG, "Pleos TTS init failed: $p0") }
            })
        }.onFailure { Log.w(TAG, "Pleos TTS init threw", it) }
    }

    fun speak(text: String): Boolean {
        val t = tts ?: return false
        if (!available) { synchronized(pending) { pending.add(text) }; return true }
        return runCatching { t.speak(text, true); true }.onFailure { Log.w(TAG, "speak", it) }.getOrDefault(false)
    }

    fun stop() { runCatching { tts?.stop() } }

    fun release() { runCatching { tts?.release() } }

    private companion object { const val TAG = "PleosTts" }
}
