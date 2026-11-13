plugins {
    id("com.android.application")
    kotlin("android")
}

// Pleos SDK 포함 빌드: ./gradlew :app:assembleRelease -Ppitstop.pleos=true
// 플래그가 없으면 SDK 없이 빌드되고 AAOS Car API(속도·기어)와 시연 패널로 동작합니다.
val usePleos = providers.gradleProperty("pitstop.pleos").orNull == "true"

android {
    namespace = "ai.pleos.pitstop.copilot"
    compileSdk = 34
    useLibrary("android.car")

    defaultConfig {
        applicationId = "ai.pleos.pitstop.copilot"
        minSdk = 29
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
    }

    signingConfigs {
        // 공모전 제출 APK용. 저장소에 키를 올리지 않도록 로컬 debug 키로 서명합니다.
        getByName("debug")
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    sourceSets["main"].java.srcDir("src/main/kotlin")
    sourceSets["main"].java.srcDir(if (usePleos) "src/pleos/kotlin" else "src/nopleos/kotlin")
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.11.0")
    if (usePleos) {
        implementation("ai.pleos.playground:Vehicle:2.3.2")
        implementation("ai.pleos.playground:NaviHelper:3.0.5")
        implementation("ai.pleos.playground:TextToSpeech:3.3.1")
        implementation("ai.pleos.playground:SpeechToText:3.3.1")
    }
}
