package ai.pleos.pitstop.copilot

import ai.pleos.pitstop.copilot.vehicle.VehicleHub
import ai.pleos.pitstop.copilot.voice.VoiceIO
import android.Manifest
import android.annotation.SuppressLint
import android.content.ClipData
import android.content.ClipboardManager
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject

/**
 * 화면은 앱 안의 웹 화면(assets/web, 오프라인)이고, 차량 값·음성·내비는 Kotlin이 맡습니다.
 * 웹 → 네이티브: window.PitStopNative.* ([Bridge])
 * 네이티브 → 웹: window.PS.onVehicle / onSpeech / onWaypointArrived
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private lateinit var hub: VehicleHub
    private lateinit var voice: VoiceIO
    @Volatile private var pageReady = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        web = WebView(this).apply {
            setBackgroundColor(0xFF000000.toInt())
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            // 시스템 글자 크기 설정이 1600x720 고정 화면을 깨지 않게 100%로 고정(큰 글자는 앱의 '쉬운 보기')
            settings.textZoom = 100
            settings.mediaPlaybackRequiresUserGesture = false
            overScrollMode = View.OVER_SCROLL_NEVER
            isVerticalScrollBarEnabled = false
            webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(m: ConsoleMessage): Boolean {
                    Log.d(TAG, "web: ${m.message()} (${m.sourceId()}:${m.lineNumber()})"); return true
                }
            }
            addJavascriptInterface(Bridge(), "PitStopNative")
            webViewClient = object : WebViewClient() {
                /** WebView 렌더러가 죽으면(메모리 부족 등) 흰 화면으로 남지 않게 액티비티를 다시 만든다. */
                override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                    Log.w(TAG, "Render process gone (crashed=${detail.didCrash()}, priority=${detail.rendererPriorityAtExit()}) → recreate")
                    runOnUiThread { recreate() }
                    return true
                }
            }
        }
        setContentView(web)
        hideSystemBars()

        voice = VoiceIO(this,
            onHeard = { text -> js("PS.onSpeech(${JSONObject.quote(text)})") },
            onError = { js("PS.onSpeechError()") })
        hub = VehicleHub(this,
            onChange = { diff -> if (pageReady) js("PS.onVehicle(${diff}, 'car')") },
            onArrived = { name -> js("PS.onWaypointArrived(${JSONObject.quote(name)})") })
        hub.start()

        web.loadUrl("file:///android_asset/web/index.html")
        pageReady = true

        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED ||
            checkSelfPermission(SPEED) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO, SPEED), 1)
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        hub.restartCar()
    }

    /** 내비 등 다른 앱에서 돌아올 때 WebView를 다시 그리게 한다(흰 화면 대비). onPause에서 web.onPause()는 부르지 않는다. */
    override fun onResume() {
        super.onResume()
        if (::web.isInitialized) { web.onResume(); web.invalidate() }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    @Suppress("DEPRECATION")
    private fun hideSystemBars() {
        window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_STABLE)
    }

    override fun onDestroy() {
        hub.stop(); voice.release(); web.destroy()
        super.onDestroy()
    }

    private fun js(code: String) = runOnUiThread { web.evaluateJavascript("window.PS && $code", null) }

    inner class Bridge {
        @JavascriptInterface fun getVehicle(): String = hub.snapshotJson()
        @JavascriptInterface fun speak(text: String) = voice.speak(text)
        @JavascriptInterface fun startListening() = runOnUiThread { voice.listen() }
        @JavascriptInterface fun addWaypoint(name: String, lat: Double, lng: Double): Boolean = hub.addWaypoint(name, lat, lng)
        @JavascriptInterface fun log(msg: String) { Log.d(TAG, "web: $msg") }
        @JavascriptInterface fun lowEffects(): Boolean = Build.FINGERPRINT.contains("generic") && LOW_FX_ON_EMULATOR
        @JavascriptInterface fun copy(text: String) {
            val cm = getSystemService(ClipboardManager::class.java)
            cm?.setPrimaryClip(ClipData.newPlainText("품번", text))
        }
    }

    companion object {
        const val TAG = "PitStop"
        const val SPEED = "android.car.permission.CAR_SPEED"
        /** 에뮬레이터에서 흐림 효과가 느리면 true로 바꿔 단색으로 그립니다. */
        const val LOW_FX_ON_EMULATOR = false
    }
}
