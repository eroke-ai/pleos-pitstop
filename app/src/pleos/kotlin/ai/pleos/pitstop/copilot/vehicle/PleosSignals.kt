package ai.pleos.pitstop.copilot.vehicle

import ai.pleos.playground.navi.constants.WaypointIndex
import ai.pleos.playground.navi.data.DestinationArrivedInfo
import ai.pleos.playground.navi.data.RequestWaypointInfo
import ai.pleos.playground.navi.data.WaypointArrivedInfo
import ai.pleos.playground.navi.helper.NaviHelper
import ai.pleos.playground.navi.helper.listener.NaviHelperEventListener
import ai.pleos.playground.vehicle.Vehicle
import ai.pleos.playground.vehicle.api.model.area.WheelArea
import ai.pleos.playground.vehicle.constant.area.WheelValue
import ai.pleos.playground.vehicle.listener.TirePressureListener
import ai.pleos.playground.vehicle.api.model.telltale.Telltales
import ai.pleos.playground.vehicle.constant.control.OilLevelState
import ai.pleos.playground.vehicle.constant.control.VehicleGear
import ai.pleos.playground.vehicle.constant.telltale.TelltaleState
import ai.pleos.playground.vehicle.constant.telltale.TelltaleType
import ai.pleos.playground.vehicle.listener.BrakePedalStatusListener
import ai.pleos.playground.vehicle.listener.DistanceDrivenListener
import ai.pleos.playground.vehicle.listener.GearSelectionListener
import ai.pleos.playground.vehicle.listener.LowWasherFluidWaringListener
import ai.pleos.playground.vehicle.listener.OilLevelStateListener
import ai.pleos.playground.vehicle.listener.TelltaleInfoListener
import android.content.Context
import android.util.Log

/**
 * Pleos Vehicle SDK 2.3.2 / NaviHelper 3.0.5에서 핏스톱이 쓰는 값을 읽습니다.
 * 시그니처 근거: notes/pleos_api.txt (javap). 값이 오기 전까지 null.
 * 각 항목은 runCatching으로 감싸 한 도메인이 없어도 나머지는 동작합니다.
 * 타이어 저압은 SDK에 전용 Boolean API가 없습니다. 계기판 경고등(Telltales)은 PRIVATE_CAR_SAFETY가
 * 필요해(에뮬레이터 SecurityException) 보조로만 두고, 바퀴별 공기압(getTirePressure)을 저압 기준
 * (getLowTirePressure, 못 읽으면 [LOW_KPA_FALLBACK])과 비교합니다.
 * 차대번호가 "invalid"이거나 주행거리가 0이면 모르는 값(null)으로 둡니다(에뮬레이터 초기값).
 */
class PleosSignals(context: Context) {
    @Volatile var gear: String? = null; private set
    @Volatile var odometerKm: Double? = null; private set
    @Volatile var brakePressed: Boolean? = null; private set
    @Volatile var vin: String? = null; private set
    @Volatile var engineOilLow: Boolean? = null; private set
    @Volatile var brakeFluidLow: Boolean? = null; private set
    @Volatile var washerLow: Boolean? = null; private set
    @Volatile var tireLow: Boolean? = null; private set

    private val vehicle = Vehicle(context)
    private val navi = NaviHelper(context)
    private var onChange: () -> Unit = {}
    private var onArrived: (String) -> Unit = {}
    @Volatile private var naviReady = false

    private val brakeListener = object : BrakePedalStatusListener {
        override fun onBrakePedalStatusUpdated(p0: Boolean?) { brakePressed = p0; onChange() }
        override fun onFailed(p0: Exception) { Log.w(TAG, "brake", p0) }
    }
    private val gearListener = object : GearSelectionListener {
        override fun onSelected(p0: VehicleGear?) { gear = mapGear(p0); onChange() }
        override fun onFailed(p0: Exception) { Log.w(TAG, "gear", p0) }
    }
    private val odoListener = object : DistanceDrivenListener {
        override fun onDistanceDrivenUpdated(p0: Float?) { setOdo(p0) }
        override fun onFailed(p0: Exception) { Log.w(TAG, "odometer", p0) }
    }
    private val oilListener = object : OilLevelStateListener {
        override fun onOilLevelUpdated(p0: OilLevelState?) { engineOilLow = isLow(p0); onChange() }
        override fun onFailed(p0: Exception) { Log.w(TAG, "engine oil", p0) }
    }
    private val brakeFluidListener = object : OilLevelStateListener {
        override fun onOilLevelUpdated(p0: OilLevelState?) { brakeFluidLow = isLow(p0); onChange() }
        override fun onFailed(p0: Exception) { Log.w(TAG, "brake fluid", p0) }
    }
    private val washerListener = object : LowWasherFluidWaringListener {
        override fun onLowWasherFluidWaringUpdated(p0: Boolean?) { washerLow = p0; onChange() }
        override fun onFailed(p0: Exception) { Log.w(TAG, "washer", p0) }
    }
    private val telltaleListener = object : TelltaleInfoListener {
        override fun onTelltaleInfoUpdated(p0: Telltales?) { p0?.let { applyTelltales(it) } }
        override fun onFailed(p0: Exception) { Log.w(TAG, "telltale", p0) }
    }

    private val wheels = listOf(WheelValue.LEFT_FRONT, WheelValue.RIGHT_FRONT, WheelValue.LEFT_REAR, WheelValue.RIGHT_REAR)
    private val pressure = HashMap<WheelValue, Float>()
    private val lowLimit = HashMap<WheelValue, Float>()
    private val tireListeners = wheels.associateWith { w ->
        object : TirePressureListener {
            override fun onTirePressureUpdated(p0: Float?) { p0?.let { setPressure(w, it) } }
            override fun onFailed(p0: Exception) { Log.w(TAG, "tire $w", p0) }
        }
    }

    private val naviListener = object : NaviHelperEventListener {
        override fun onWayPointArrived(info: WaypointArrivedInfo) {
            onArrived(info.name.ifBlank { "정비소" })
        }
        override fun onDestinationArrived(info: DestinationArrivedInfo) {
            onArrived(info.name.ifBlank { "정비소" })
        }
    }

    fun start(onChange: () -> Unit, onArrived: (String) -> Unit) {
        this.onChange = onChange; this.onArrived = onArrived
        runCatching { vehicle.initialize() }.onFailure { Log.w(TAG, "Vehicle SDK unavailable", it) }
        attempt("brake") { vehicle.getBrake().registerBrakePedalStatus(brakeListener) }
        attempt("gear") { vehicle.getGear().registerGearSelection(gearListener) }
        attempt("odometer") { vehicle.getOdometer().registerDistanceDriven(odoListener) }
        attempt("engine oil") { vehicle.getSafety().registerEngineOilLevelState(oilListener) }
        attempt("brake fluid") { vehicle.getSafety().registerBrakeFluidLevelState(brakeFluidListener) }
        attempt("washer") { vehicle.getSafety().registerLowWasherFluidWaringState(washerListener) }
        attempt("telltale") { vehicle.getSafety().registerTelltales(telltaleListener) }
        for (w in wheels) {
            val area = WheelArea(w)
            attempt("tire $w") { vehicle.getTire().registerTirePressure(area, tireListeners.getValue(w)) }
            attempt("tire low $w") { vehicle.getTire().getLowTirePressure(area, { v -> v?.let { synchronized(pressure) { lowLimit[w] = it } } }, { Log.w(TAG, "low limit $w", it) }) }
            attempt("tire read $w") { vehicle.getTire().getTirePressure(area, { v -> v?.let { setPressure(w, it) } }, { Log.w(TAG, "tire read $w", it) }) }
        }
        readOnce()
        attempt("navi init") {
            navi.initialize({ naviReady = true; navi.addListener(naviListener); Log.i(TAG, "NaviHelper ready") },
                { Log.w(TAG, "NaviHelper unavailable", it) })
        }
    }

    /** 리스너는 값이 바뀔 때만 오므로, 시작 시 현재 값을 한 번 읽어 둡니다. */
    private fun readOnce() {
        val fail: (Exception) -> Unit = { Log.w(TAG, "read failed", it) }
        attempt("gear read") { vehicle.getGear().getCurrentGearSelectionState({ gear = mapGear(it); onChange() }, fail) }
        attempt("odo read") { vehicle.getOdometer().getCurrentDistanceDriven({ setOdo(it) }, fail) }
        attempt("vin read") { vehicle.getCarInfo().getVINInfo({ setVin(it) }, fail) }
        attempt("brake read") { vehicle.getBrake().getCurrentBrakePedalStatus({ brakePressed = it; onChange() }, fail) }
        attempt("oil read") { vehicle.getSafety().getEngineOilLevelState({ engineOilLow = isLow(it); onChange() }, fail) }
        attempt("fluid read") { vehicle.getSafety().getBrakeFluidLevelState({ brakeFluidLow = isLow(it); onChange() }, fail) }
        attempt("washer read") { vehicle.getSafety().hasLowWasherFluidWarning({ washerLow = it; onChange() }, fail) }
        attempt("telltale read") { vehicle.getSafety().getTelltalesInfo({ it?.let { t -> applyTelltales(t) } }, fail) }
    }

    private fun setOdo(v: Float?) {
        if (v == null || v <= 0f) return
        odometerKm = v.toDouble(); onChange()
    }

    private fun setVin(v: String?) {
        val clean = v?.trim()?.trim('"')
        if (clean.isNullOrBlank() || clean.equals("invalid", true) || clean.length < 11) { Log.i(TAG, "VIN unavailable: $v"); return }
        vin = clean; onChange()
    }

    private fun setPressure(w: WheelValue, kpa: Float) {
        val low = synchronized(pressure) {
            pressure[w] = kpa
            pressure.any { (k, p) -> p > 0f && p < (lowLimit[k]?.takeIf { it > 0f } ?: LOW_KPA_FALLBACK) }
        }
        if (tireLow != low) { tireLow = low; onChange() }
    }

    private fun applyTelltales(t: Telltales) {
        val tpms = t.telltales.firstOrNull { it.type == TelltaleType.TPMS } ?: return
        tireLow = tpms.state != TelltaleState.OFF
        onChange()
    }

    fun addWaypoint(name: String, lat: Double, lng: Double): Boolean {
        if (!naviReady) return false
        return runCatching {
            // RequestWaypointInfo(lat, lng, poiName?, waypointIndex, poiId, address, poiSubId, poiProvider = "")
            navi.addWaypoint(RequestWaypointInfo(lat, lng, name, WaypointIndex.FIRST, "", "", "", ""))
            true
        }.onFailure { Log.w(TAG, "addWaypoint", it) }.getOrDefault(false)
    }

    fun stop() {
        runCatching { vehicle.getBrake().unregisterBrakePedalStatus(brakeListener) }
        runCatching { vehicle.getGear().unregisterGearSelection(gearListener) }
        runCatching { vehicle.getOdometer().unregisterDistanceDriven(odoListener) }
        runCatching { vehicle.getSafety().unregisterEngineOilLevelState(oilListener) }
        runCatching { vehicle.getSafety().unregisterBrakeFluidLevelState(brakeFluidListener) }
        runCatching { vehicle.getSafety().unregisterLowWasherFluidWaringState(washerListener) }
        runCatching { vehicle.getSafety().unregisterTelltales(telltaleListener) }
        for (w in wheels) runCatching { vehicle.getTire().unregisterTirePressure(WheelArea(w), tireListeners.getValue(w)) }
        runCatching { navi.removeListener(naviListener) }
        runCatching { navi.release() }
        runCatching { vehicle.release() }
    }

    private inline fun attempt(what: String, block: () -> Unit) {
        runCatching(block).onFailure { Log.w(TAG, "$what n/a", it) }
    }

    private fun isLow(s: OilLevelState?): Boolean? = s?.let { it == OilLevelState.LOW || it == OilLevelState.CRITICALLY_LOW }

    private fun mapGear(g: VehicleGear?): String? = when (g) {
        null -> null
        VehicleGear.GEAR_PARK -> "P"
        VehicleGear.GEAR_REVERSE -> "R"
        VehicleGear.GEAR_NEUTRAL -> "N"
        VehicleGear.GEAR_UNKNOWN -> null
        else -> "D"
    }

    private companion object {
        const val TAG = "PleosSignals"
        /** 저압 기준을 차량에서 못 읽을 때 쓰는 값: 약 26psi (권장 33~36psi의 약 75%, TPMS 경고 수준). */
        const val LOW_KPA_FALLBACK = 180f
    }
}
