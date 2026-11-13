# Pleos PitStop (플레오스 핏스톱)

더 뉴 그랜저(Pleos Connect)용 정비 비서 앱입니다. 주차하면 교체할 때가 된 부품을 차 그림 위에 보여 주고, 내 차에 맞는 순정 품번을 찾아 주문하고, 정비 이력을 남깁니다. 주행 중에는 화면을 줄이고, 이상한 소리가 나면 버튼 한 번으로 그 순간의 차량 상태를 기록합니다.

- 2026 현대자동차·기아 차량용 앱 개발 공모전 출품작 (팀 이로케)
- 현대모비스 WPC 연계를 가정한 시제품입니다. **화면의 품번·가격·재고는 예시**이며 실제 값이 아닙니다.

## 구성
| 위치 | 내용 |
|---|---|
| `app/src/main/assets/web/` | 화면(오프라인 웹 화면, WebView에서 실행) — 정비 지도, 부품 그림, 검색, 주문, 주행 중, 정비 요청서, 정비 이력 |
| `app/src/main/kotlin/` | 앱 본체: WebView, 차량 신호 전달(VehicleHub), 음성 안내·인식(VoiceIO) |
| `app/src/pleos/` | Pleos Vehicle SDK 2.3.2, NaviHelper 3.0.5, TextToSpeech 3.3.1, SpeechToText 3.3.1 연결 |
| `app/src/nopleos/` | SDK 없이 빌드할 때 쓰는 빈 구현 |
| `tools/cases.js` | 전체 경우 자동 테스트 63개 (Playwright) |
| `tools/ab.js` | 화면 대안 비교(주문 단계, 증상 기록 시점, 음성 찾기 위치) 자동 측정 |
| `tools/ab2.js` | 이전 첫 화면 대 투시 렌즈 첫 화면 자동 측정 (결과: `docs/ab-test-2.md`) |
| `tools/persona2.js` | Pleos Connect 적용 차종(그랜저·아반떼·투싼)별 운전자 조건 A/B 자동 측정 (결과: `docs/ab-test-3-vehicle-personas.md`, 실제 사용자 실험 아님) |
| `tools/persona.js` | 사용자 유형 5가지 조건별 기존안·개선안 자동 측정 (결과: `docs/persona-test.md`, 실제 사용자 실험 아님) |
| `tools/render3d/` | 엔진·부품 3D 모델(three.js 0.160)과 Blender(bpy) 렌더 스크립트 |
| `docs/design-decisions.md` | 개발 전 조사와 화면 설계 결정 |

## 쓰는 차량 신호
| 신호 | 출처 |
|---|---|
| 차속 | AAOS `PERF_VEHICLE_SPEED` |
| 기어 | Pleos `Gear.registerGearSelection` |
| 브레이크 페달 | Pleos `Brake.registerBrakePedalStatus` |
| 주행거리 | Pleos `Odometer.registerDistanceDriven` |
| 차대번호 | Pleos `CarInfo.getVINInfo` (화면에는 가운데를 가림) |
| 엔진오일·브레이크액·워셔액 | Pleos `Safety` (에뮬레이터 미지원 → 시연 패널) |
| 바깥 기온 | AAOS `ENV_OUTSIDE_TEMPERATURE` (7℃ 아래면 겨울 전 점검 카드, 값이 없으면 시연 패널) |
| 경유지 추가·도착 | Pleos NaviHelper `addWaypoint`, `onWayPointArrived` |
| 타이어 공기압 | Pleos `Tire.registerTirePressure`, `getLowTirePressure` (에뮬레이터에 신호가 없으면 시연 패널) |
| 음성 안내 | Pleos TextToSpeech (기본 TTS 엔진이 없을 때) |
| 음성 인식 | Pleos SpeechToText (기기 안에서 인식, 외부 음성 인식 서비스는 쓰지 않음) |

차량 제어나 PRIVATE 권한은 쓰지 않습니다.

## 빌드
```
./gradlew assembleDebug                        # SDK 없이
./gradlew -Ppitstop.pleos=true assembleRelease # Pleos SDK 포함
```
Pleos Maven 저장소: `https://nexus-playground.pleos.ai/repository/maven-releases/`

## 테스트 환경
- 에뮬레이터: Pleos Connect 에뮬레이터 v2.1.0 (AVD `Pleos_Connect_v2.1.0`)
- 화면: 2560×1080, 120dpi (위 AVD를 복제해 화면 크기만 바꿈)
- JDK 17, Gradle 8.10.2, minSdk 29 / targetSdk 34
- APK 위치: `apk/이로케_PleosPitStop_release.apk` (`-Ppitstop.pleos=true`로 빌드한 release)
- 설치: `adb install -r apk/이로케_PleosPitStop_release.apk`
- 자동 테스트: `node tools/cases.js app/src/main/assets/web out` (63개, Playwright 필요)

## 시연 방법
- 에뮬레이터: Pleos Connect AVD를 복제해 화면을 2560×1080, 120dpi로 두면 시안 크기대로 보입니다(기본 1024×768은 앱 창이 작습니다). 실행 옵션 `-crash-report-mode never`.
- 기어·속도: Virtual Console. 에뮬레이터에 없는 신호(소모품 경고 등)는 앱 로고를 세 번 누르면 나오는 시연 패널로 넣습니다.

## 이미지 안내
`app/src/main/assets/web/img/`의 차량 이미지는 현대자동차 공식 사진을 가공한 것으로, 공모전 심사용으로만 쓰며 이 저장소에는 넣지 않았습니다. 빌드하려면 `img/README.txt`에 적힌 이름의 이미지를 넣어야 화면에 차가 보입니다(제출 APK에는 포함).
