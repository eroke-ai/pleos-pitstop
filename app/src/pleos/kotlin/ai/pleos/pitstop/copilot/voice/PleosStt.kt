package ai.pleos.pitstop.copilot.voice

import ai.pleos.playground.stt.SpeechToText
import ai.pleos.playground.stt.constant.ErrorType
import ai.pleos.playground.stt.constant.Mode
import ai.pleos.playground.stt.listener.OnInitializeListener
import ai.pleos.playground.stt.listener.ResultListener
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.util.Locale

/**
 * Pleos STT SDK 3.3.1 (ON_DEVICE). 공모전 규정상 외부 음성 인식을 쓰지 않으므로 pleos 빌드는 이 경로만 씁니다.
 * 결과는 최종(isFinal) 문장 하나만 [onHeard]로, 오류·시간 초과는 [onFailed]로 한 번만 알립니다.
 */
class PleosStt(context: Context, private val onHeard: (String) -> Unit, private val onFailed: (String) -> Unit) {
    @Volatile var ready = false; private set
    private val main = Handler(Looper.getMainLooper())
    private var active = false
    private var lastPartial: String? = null
    private val stt = runCatching { SpeechToText(context.applicationContext, Mode.ON_DEVICE) }
        .onFailure { Log.w(TAG, "Pleos STT create failed", it) }.getOrNull()

    private val listener = object : ResultListener {
        override fun onReady() { Log.i(TAG, "onReady") }
        override fun onStartedRecognition() { Log.i(TAG, "onStartedRecognition") }
        override fun onEndedRecognition() {
            Log.i(TAG, "onEndedRecognition partial=$lastPartial")
            // 최종 결과 없이 끝나면 마지막 중간 결과를 쓰고, 그것도 없으면 실패로 본다
            main.postDelayed({ if (active) finish(lastPartial?.takeIf { it.isNotBlank() }, "ended-empty") }, 400)
        }
        override fun onUpdated(p0: String, p1: Boolean) {
            Log.i(TAG, "onUpdated final=$p1 text=$p0")
            if (p0.isBlank()) return
            if (p1) main.post { finish(p0, null) } else lastPartial = p0
        }
        override fun onUpdatedEpdData(p0: Long, p1: Long) = Unit
        override fun onUpdatedRms(p0: Double) = Unit
        override fun onError(p0: ErrorType) { Log.w(TAG, "onError $p0"); main.post { finish(null, "error:$p0") } }
    }

    init {
        runCatching {
            stt?.initialize(object : OnInitializeListener {
                override fun onSuccess() {
                    Log.i(TAG, "Pleos STT ready")
                    runCatching { stt.setLocale(Locale.KOREA) }
                    runCatching { stt.addListener(listener) }
                    ready = true
                }
                override fun onFailure(p0: ErrorType) { Log.w(TAG, "Pleos STT init failed: $p0") }
            })
        }.onFailure { Log.w(TAG, "Pleos STT init threw", it) }
    }

    /** 인식 시작. [timeoutMs] 안에 결과가 없으면 멈추고 실패로 알린다(웹 화면 9초 자동 종료와 맞춤). */
    fun listen(timeoutMs: Long) {
        val s = stt
        if (s == null || !ready) { onFailed("not-ready"); return }
        if (active) runCatching { s.stop() }
        active = true; lastPartial = null
        main.removeCallbacksAndMessages(TIMEOUT_TOKEN)
        main.postAtTime({ if (active) { runCatching { s.stop() }; finish(lastPartial?.takeIf { it.isNotBlank() }, "timeout") } },
            TIMEOUT_TOKEN, android.os.SystemClock.uptimeMillis() + timeoutMs)
        runCatching { s.request(); Log.i(TAG, "request()") }.onFailure { Log.w(TAG, "request failed", it); finish(null, "request-threw") }
    }

    fun stop() { if (active) { runCatching { stt?.stop() }; active = false; main.removeCallbacksAndMessages(TIMEOUT_TOKEN) } }

    private fun finish(text: String?, why: String?) {
        if (!active) return
        active = false; main.removeCallbacksAndMessages(TIMEOUT_TOKEN)
        if (text != null) onHeard(text) else { Log.w(TAG, "no result: $why"); onFailed(why ?: "unknown") }
    }

    fun release() { stop(); runCatching { stt?.removeListener(listener) }; runCatching { stt?.release() } }

    companion object {
        /** pleos 빌드: Pleos STT만 사용 */
        const val ENABLED = true
        private const val TAG = "PleosStt"
        private val TIMEOUT_TOKEN = Any()
    }
}
