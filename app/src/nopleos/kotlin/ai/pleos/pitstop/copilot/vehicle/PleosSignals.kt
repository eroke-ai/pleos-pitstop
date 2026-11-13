package ai.pleos.pitstop.copilot.vehicle

import android.content.Context

/** Pleos SDK 없이 빌드할 때 쓰는 빈 구현. 모든 값은 null(모름)이고 시연 패널 값이 쓰입니다. */
@Suppress("UNUSED_PARAMETER")
class PleosSignals(context: Context) {
    val gear: String? = null
    val odometerKm: Double? = null
    val brakePressed: Boolean? = null
    val vin: String? = null
    val engineOilLow: Boolean? = null
    val brakeFluidLow: Boolean? = null
    val washerLow: Boolean? = null
    val tireLow: Boolean? = null
    fun start(onChange: () -> Unit, onArrived: (String) -> Unit) = Unit
    fun stop() = Unit
    fun addWaypoint(name: String, lat: Double, lng: Double): Boolean = false
}
