package ai.pleos.pitstop.copilot.vehicle

import android.car.Car
import android.car.VehicleGear
import android.car.VehiclePropertyIds
import android.car.hardware.CarPropertyValue
import android.car.hardware.property.CarPropertyManager
import android.content.Context
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.util.Log
import org.json.JSONObject

/**
 * 차량 값을 한곳에 모아 화면으로 보냅니다.
 * - 차속·기어: AAOS 표준 Car API (세이프아웃에서 에뮬레이터 동작 확인)
 * - 주행거리·브레이크 페달·소모품 경고·차대번호·기어(보조)·경유지: Pleos SDK ([PleosSignals])
 * 값이 바뀐 항목만 JSON으로 보내고, 모르는 값(null)은 보내지 않아 시연 패널 값을 덮어쓰지 않습니다.
 */
class VehicleHub(
    private val context: Context,
    private val onChange: (String) -> Unit,
    private val onArrived: (String) -> Unit,
) {
    private val main = Handler(Looper.getMainLooper())
    private var car: Car? = null
    private var props: CarPropertyManager? = null
    private val pleos = PleosSignals(context)
    /** Pleos SDK 등록은 바인더 호출이 많아 메인 스레드에서 하면 첫 화면이 3초 넘게 늦어집니다(에뮬레이터 측정). */
    private val worker = HandlerThread("pleos-signals").apply { start() }
    private val bg = Handler(worker.looper)
    private val last = JSONObject()

    @Volatile private var speedKph: Double? = null
    @Volatile private var gear: String? = null
    /** 바깥 기온(섭씨). 차에서 한 번도 안 오면 null로 두어 웹이 기온 카드를 숨기게 한다. */
    @Volatile private var tempC: Double? = null

    private val carCallback = object : CarPropertyManager.CarPropertyEventCallback {
        override fun onChangeEvent(v: CarPropertyValue<*>) {
            when (v.propertyId) {
                VehiclePropertyIds.PERF_VEHICLE_SPEED -> speedKph = ((v.value as Float) * 3.6).coerceAtLeast(0.0)
                VehiclePropertyIds.GEAR_SELECTION -> gear = mapGear(v.value as Int)
                VehiclePropertyIds.ENV_OUTSIDE_TEMPERATURE -> runCatching {
                    val t = (v.value as Number).toDouble()
                    // 1℃ 미만 변화는 무시(처음 값은 그대로 받음)
                    if (tempC == null || kotlin.math.abs(t - tempC!!) >= 1.0) tempC = Math.round(t * 10) / 10.0
                }.onFailure { Log.w(TAG, "outside temp value", it) }
            }
            emit()
        }
        override fun onErrorEvent(propertyId: Int, zone: Int) = Unit
    }

    fun start() {
        startCar()
        bg.post { pleos.start(onChange = { main.post { emit() } }, onArrived = { name -> main.post { onArrived(name) } }) }
    }

    fun restartCar() { stopCar(); startCar() }

    private fun startCar() {
        runCatching {
            val c = Car.createCar(context); car = c
            val m = c.getCarManager(Car.PROPERTY_SERVICE) as CarPropertyManager; props = m
            for (id in listOf(VehiclePropertyIds.PERF_VEHICLE_SPEED, VehiclePropertyIds.GEAR_SELECTION, VehiclePropertyIds.ENV_OUTSIDE_TEMPERATURE)) {
                runCatching { m.registerCallback(carCallback, id, CarPropertyManager.SENSOR_RATE_ONCHANGE) }
                    .onFailure { Log.w(TAG, "Car property $id unavailable", it) }
            }
        }.onFailure { Log.w(TAG, "Car API unavailable", it) }
    }

    private fun stopCar() {
        runCatching { props?.unregisterCallback(carCallback) }
        runCatching { car?.disconnect() }
        car = null; props = null
    }

    fun stop() { stopCar(); bg.post { pleos.stop(); worker.quitSafely() } }

    fun addWaypoint(name: String, lat: Double, lng: Double): Boolean = pleos.addWaypoint(name, lat, lng)

    fun snapshotJson(): String = current().toString()

    private fun current(): JSONObject {
        val o = JSONObject()
        (gear ?: pleos.gear)?.let { o.put("gear", it) }
        speedKph?.let { o.put("speed", Math.round(it * 10) / 10.0) }
        tempC?.let { o.put("temp", it) }
        pleos.odometerKm?.let { o.put("odo", it) }
        pleos.brakePressed?.let { o.put("brake", it) }
        pleos.vin?.let { o.put("vin", it) }
        val w = JSONObject()
        pleos.engineOilLow?.let { w.put("engineOil", it) }
        pleos.brakeFluidLow?.let { w.put("brakeFluid", it) }
        pleos.washerLow?.let { w.put("washer", it) }
        pleos.tireLow?.let { w.put("tire", it) }
        if (w.length() > 0) o.put("warn", w)
        return o
    }

    @Synchronized private fun emit() {
        val now = current(); val diff = JSONObject()
        for (k in now.keys()) {
            val v = now.get(k)
            if (k == "warn") {
                val wd = JSONObject(); val prev = last.optJSONObject("warn") ?: JSONObject()
                for (wk in (v as JSONObject).keys()) if (prev.opt(wk) != v.get(wk)) wd.put(wk, v.get(wk))
                if (wd.length() > 0) diff.put("warn", wd)
            } else if (last.opt(k) != v) diff.put(k, v)
        }
        if (diff.length() == 0) return
        for (k in now.keys()) last.put(k, now.get(k))
        onChange(diff.toString())
    }

    private fun mapGear(g: Int): String = when (g) {
        VehicleGear.GEAR_PARK -> "P"
        VehicleGear.GEAR_REVERSE -> "R"
        VehicleGear.GEAR_NEUTRAL -> "N"
        else -> "D"
    }

    private companion object { const val TAG = "VehicleHub" }
}
