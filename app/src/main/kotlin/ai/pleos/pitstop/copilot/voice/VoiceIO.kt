package ai.pleos.pitstop.copilot.voice

import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import java.util.Locale

/**
 * 음성 안내(TTS)와 음성 인식(STT). 안내 중에는 음악을 끄지 않고 소리만 줄입니다(MAY_DUCK).
 * 음성 인식: pleos 빌드는 Pleos STT SDK(ON_DEVICE)만 씁니다(공모전 규정: 외부 음성 인식 금지).
 * 안드로이드 기본 SpeechRecognizer는 Pleos SDK가 없는 nopleos 빌드에서만 씁니다.
 */
class VoiceIO(
    private val context: Context,
    private val onHeard: (String) -> Unit,
    private val onError: () -> Unit,
) {
    private val audio = context.getSystemService(AudioManager::class.java)
    private val attrs = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
    private val focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK).setAudioAttributes(attrs).build()

    @Volatile private var ttsReady = false
    private val pending = ArrayList<String>()
    private val tts = TextToSpeech(context.applicationContext) { status ->
        ttsReady = status == TextToSpeech.SUCCESS
        ttsFailed = !ttsReady
        Log.i(TAG, "TTS init status=$status")
        if (ttsReady) setupTts() else flushToPleos()
    }
    private var recognizer: SpeechRecognizer? = null
    /** Pleos Connect에는 기본 TTS 엔진이 없어 표준 TTS 초기화가 실패하면 Pleos TTS로 말합니다. */
    private val pleosTts = PleosTts(context) { audio.abandonAudioFocusRequest(focus) }
    @Volatile private var ttsFailed = false
    private val pleosStt = PleosStt(context, onHeard = { onHeard(it) }, onFailed = { onError() })

    private fun setupTts() {
        tts.language = Locale.KOREAN
        tts.setAudioAttributes(attrs)
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(id: String?) = Unit
            override fun onDone(id: String?) { audio.abandonAudioFocusRequest(focus) }
            @Deprecated("old api") override fun onError(id: String?) { audio.abandonAudioFocusRequest(focus) }
        })
        synchronized(pending) { pending.forEach { speak(it) }; pending.clear() }
    }

    private fun flushToPleos() {
        synchronized(pending) { pending.forEach { pleosTts.speak(it) }; pending.clear() }
    }

    fun speak(text: String) {
        if (ttsFailed) { audio.requestAudioFocus(focus); if (!pleosTts.speak(text)) Log.w(TAG, "no TTS engine"); return }
        if (!ttsReady) { synchronized(pending) { pending.add(text) }; return }
        audio.requestAudioFocus(focus)
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "ps-${System.currentTimeMillis()}")
    }

    fun listen() {
        // 인식 중에는 안내 음성과 겹치지 않게 먼저 멈춘다
        runCatching { if (ttsReady) tts.stop() }; pleosTts.stop(); audio.abandonAudioFocusRequest(focus)
        if (PleosStt.ENABLED) { pleosStt.listen(LISTEN_TIMEOUT_MS); return }
        if (!SpeechRecognizer.isRecognitionAvailable(context)) { Log.w(TAG, "STT unavailable"); onError(); return }
        val r = recognizer ?: SpeechRecognizer.createSpeechRecognizer(context).also { recognizer = it }
        r.setRecognitionListener(object : RecognitionListener {
            override fun onResults(b: Bundle) {
                val heard = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty().firstOrNull()
                if (heard.isNullOrBlank()) onError() else onHeard(heard)
            }
            override fun onError(error: Int) { Log.w(TAG, "STT error $error"); onError() }
            override fun onReadyForSpeech(p: Bundle?) = Unit
            override fun onBeginningOfSpeech() = Unit
            override fun onRmsChanged(v: Float) = Unit
            override fun onBufferReceived(b: ByteArray?) = Unit
            override fun onEndOfSpeech() = Unit
            override fun onPartialResults(b: Bundle?) = Unit
            override fun onEvent(t: Int, b: Bundle?) = Unit
        })
        r.startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ko-KR")
            .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3))
    }

    fun release() { runCatching { tts.shutdown() }; pleosTts.release(); pleosStt.release(); runCatching { recognizer?.destroy() } }

    private companion object {
        const val TAG = "VoiceIO"
        /** 웹 화면은 9초 뒤 자동 종료한다. 네이티브도 그 직후 인식을 멈춰 마이크를 계속 잡고 있지 않게 한다. */
        const val LISTEN_TIMEOUT_MS = 9000L
    }
}
