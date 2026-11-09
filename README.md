<div align="center">

<img src="https://raw.githubusercontent.com/Nunchi-ML/.github/main/profile/assets/logo.png" width="96" alt="Nunchi-ML"/>

# Nunchi-ML_FE

☀️ 눈부심 노출 비교와 사전 인지·대응을 체험하는 운전 시뮬레이터

![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB) ![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white) ![three.js](https://img.shields.io/badge/three.js-000000?style=flat-square&logo=threedotjs&logoColor=white) ![react--three--fiber](https://img.shields.io/badge/react--three--fiber-222222?style=flat-square) ![zustand](https://img.shields.io/badge/zustand-443E38?style=flat-square) ![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat-square&logo=vercel&logoColor=white)

[![Notion](https://img.shields.io/badge/Notion-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8%20%ED%99%88-000000?style=flat-square&logo=notion&logoColor=white)](https://app.notion.com/p/40554fa7e143815680c0cfb0ff414d78) [![GitHub](https://img.shields.io/badge/GitHub-Nunchi--ML-181717?style=flat-square&logo=github&logoColor=white)](https://github.com/Nunchi-ML)

</div>

---

## 👥 담당

이성진

## 🧰 기술 스택

| 하는 일 | 기술 |
|---|---|
| 화면 틀 | React · Vite · TypeScript |
| 3D 운전석 | three.js (직접 구성) |
| 눈부심 연출 | three.js EffectComposer · UnrealBloomPass · 톤 매핑 |
| 상태 (시간 · 위치 · 예측값) | zustand |
| 도로 · 건물 | OpenStreetMap 데이터 (달구벌대로 · 신천대로) |
| 배포 | Vercel — https://nunchi-drive.vercel.app (GitHub Actions 자동 배포) |

## 🎨 화면 — 노션 「웹사이트 명세」가 정본

| 화면 ID | 화면 | 보이는 것 |
|---|---|---|
| `S-01` | 🚗 운전석 시뮬레이터 | 날짜·시간·건물 가림에 따른 햇빛, 밝기 전환과 차량 내 사전 안내, 도로변 3D 전광판(앞 구간 눈부심 등급·지하차도 진입 전 밝기 전환 안내) |
| `S-02` | 🗺️ 경로 사전 안내 | 도로변 사진 + 해 위치·날씨 결합 · 관측 유효시간 · 예상 도착 시각 · 미확인 구간 |
| `S-03` | ℹ️ 기능 연결 상태 | 실제 입력·사진 1장 시범 API·가상 예시·밝기 체험 구분 |
| `S-04` | 🎬 실제 영상 모드 | 유튜브 공식 플레이어 위에 위치 · 예측을 겹쳐 보기 |

> 실제 카메라·교통·대안 경로와 최종 모델은 미연결입니다. 화면의 가상 관측 예시와 시야 연출을 실사용 성능으로 해석하지 않습니다.

기획과 구현 범위는 [서비스 기획 연결 문서](docs/서비스_기획_시뮬레이터_연결.md)에 정리했습니다.

## 📌 원칙

- 카메라 앱의 모델②는 `/api/predict/glare` → Render `/predict/glare` 시범 API를 사용합니다. `vercel.json` 외부 rewrite로 운영·미리보기 모두 같은 origin에서 요청합니다. 로컬 Vite도 같은 프록시를 제공합니다.
- 가상 전방 사진은 고정 66° 화각·16:9로 촬영하고 휴대폰을 든 3D 연출을 제외합니다. 실제 카메라는 원본 비율을 유지합니다. 긴 변 최대1280(확대 없음), JPEG quality0.95, 파일1MiB 이하이며 한 번에 요청 하나만 보냅니다. 사진 한 장의 결과를 확인한 뒤 다시 찍어 분석합니다.
- 첫 요청은 최대90초 대기, 실패 시 `판정 불가`와 재시도 버튼을 표시합니다. 오류를 정상으로 바꾸거나 임시 규칙으로 대체하지 않습니다. 탭/앱을 닫거나 소스를 바꾸면 진행 중 요청·카메라 스트림을 정리합니다.
- 사용자가 분석 시작을 누르기 전에는 전송하지 않습니다. 실제 카메라는 별도로 선택해야 권한을 요청합니다. 미리보기 캔버스는 전송한 프레임과 같으며 좌표는 전체 프레임 기준입니다.
- 전 경로 안내는 도로변 사진+사진 시점 G를 중심으로 위치·방향/화각·관측시각/유효시간·경로 ETA를 대응합니다. G전용·사진전용으로 미확인 구간을 정상 처리하지 않습니다. 기존 사고 연구는 별도 보존하고 사용자 화면의 위험 배수·안전 점수는 제거했습니다. 신천대로의 휘도비·동공·출구 순응은 실제 생리학적 예측과 구분한 체험입니다.
- 필요한 경우 `VITE_API_BASE_URL`로 기본 `/api`를 덮어쓸 수 있습니다(직접 외부 API 지정 시 해당 origin의 CORS 허용 필요).
- `npm test`로 모델 응답 검증·JPEG 용량·전체프레임 크기·multipart·서버오류/취소 처리를 검증합니다. CI는 이 검사와 타입/빌드를 통과해야 배포합니다.
- 2.56MB 건물 JSON은 별도 해시 자산으로 내려받습니다. JS에서 분리했지만 총 다운로드에서 사라진 것은 아닙니다. 초기 로딩·실패 화면을 제공합니다.

## 🚀 자동 배포

| 언제 | 무엇이 | 어디로 |
|---|---|---|
| PR을 열거나 커밋을 올리면 | 미리보기 배포 → PR에 주소 댓글 | `nunchi-drive-…vercel.app` (PR마다 따로) |
| `main`에 병합되면 | 운영 배포 | https://nunchi-drive.vercel.app |

- 흐름: `.github/workflows/deploy.yml` — Vercel CLI로 `vercel pull → vercel build(타입 검사 포함) → vercel deploy`
- 조직(Nunchi-ML)에 Vercel GitHub 앱이 없어서 Actions에서 직접 배포해요

<details>
<summary><b>⚙️ 처음 한 번 설정</b> (펼치기 — 저장소 관리자만)</summary>

<br/>

1. https://vercel.com/account/tokens 에서 토큰 만들기 — Scope는 **faitruee's projects** 팀, 이름은 `github-actions-nunchi-fe` 정도
2. GitHub 저장소 **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `VERCEL_TOKEN` · Secret: 1에서 만든 토큰
3. 끝. 다음 PR부터 자동으로 배포돼요 (토큰이 없으면 배포 단계만 건너뛰고 실패하지 않아요)

- 팀 · 프로젝트 ID(`VERCEL_ORG_ID` · `VERCEL_PROJECT_ID`)는 비밀이 아니라 워크플로 파일에 적어 뒀어요
- 나중에 조직에 Vercel GitHub 앱을 설치해 Git 연결을 켜면, 이 워크플로는 지워야 두 번 배포되지 않아요

</details>

<details>
<summary><b>🗺️ 지도 데이터 다시 받기</b> (펼치기)</summary>

<br/>

| 스크립트 | 받는 것 | 결과 |
|---|---|---|
| `python scripts/fetch_osm.py` | OpenStreetMap — 사거리 · 옆길 · 횡단보도 · 버스정류장 · 지하철 출입구 | `src/data/dalgu_osm.json` |
| `python scripts/fetch_arm_places.py` | 브이월드 주소 찾기 — 옆길 행선지 동 (도로 안내 표지) | 같은 파일에 추가 |
| `python scripts/fetch_vworld.py` | 브이월드 도로명주소건물 — 건물 윤곽 · 층수 · 이름 | `src/data/dalgu_buildings.json` |
| `python scripts/fetch_sincheon.py` | OSM 원본 지도 API — 신천대로 연결 선형·지하차도 입출구·하천 | `src/data/sincheon.json`, `sincheon_osm.json` |
| `python scripts/fetch_vworld.py --road sincheon` | 신천대로 양옆 300 m 브이월드 건물 윤곽·지상 층수 | `src/data/sincheon_buildings.json` |

- 브이월드 스크립트는 `.env.local`의 `VWORLD_KEY`가 필요해요 (`VITE_` 붙이지 않기 — 사이트에 실리지 않게)

### 신천대로 데이터와 순응 체험

- 메뉴에서 신천대로를 고르거나 `?road=sincheon`으로 엽니다. 도로 전환은 장면과 공간 인덱스가 함께 초기화되도록 페이지를 다시 불러옵니다.
- 상동교 부근→서대구IC 부근 OSM 본선 14.269 km, 192점, `tunnel=yes` 지하차도 12구간을 사용합니다. 한쪽 본선 좌표를 왕복 2+2차로로 단순화했으며, 관리기관의 전체 관리 연장과 같다고 주장하지 않습니다.
- 건물 9,718동은 브이월드 `LT_C_SPBD`의 실제 윤곽·층수입니다. 높이는 층수×가정 층고, 용도는 이름/층수로 추정합니다. 지하차도 깊이 4.5 m·통과 높이 4.8 m·램프 길이 65 m와 하천 폭도 시각화 가정입니다. 실측 수직 제원과 방향별 상세 차로 구성은 별도 보완 대상입니다.
- 개방형 진입로의 콘크리트 줄눈·오염 질감, 상단 난간, 중앙 콘크리트 분리대·안전망, 배수로, 입구 반사 표지와 명칭 표지를 추가했습니다. 제공된 거리 사진을 참고한 공통 시각화 디테일이며, 현장의 방향별 시설물을 정밀 측량한 재현은 아닙니다. 텍스처는 로컬에서 절차적으로 생성하고 구조물은 10개 재질 배치로 묶습니다.
- 경사로·옹벽·천장·포털·내부 조명과 지면 개구부를 구성합니다. 차량과 카메라가 도로 높이를 따르며, 천장을 태양광 차폐 판정에 포함합니다. 입체교차를 평면 신호교차로나 횡단보도로 만들지 않습니다.
- 모델③ 점수는 AI 저장소 `src/nunchi_ml/tunnel/adaptation.py` 초안의 `log10(바깥 휘도 / 안쪽 휘도) / 2`와 4단계 조광 규칙을 옮겼습니다. 바깥 밝기는 현재 장면의 태양 높이·날씨 가정값입니다. ASOS 실측, 사진 밝기 ML, 학습된 동공 모델의 추론값이 아닙니다.
- 밝기 이력을 유지해 진입 시 어두움, 진출 시 번짐·대비 저하·회복과 동공 반응 도식을 보여줍니다. 연출의 시간상수는 실제 생리학적 순응시간 추정이 아닙니다. 재출발 시 초기화하고 휴대폰을 열면 진행을 멈춥니다.
- `npm test`는 모델③ 초안 식의 일치, 밝기 이력/야간/회복, 양방향 포털 판정, 지면 구멍과 천장 차광, 달구벌대로 기존 차로와 차량 간격을 검사합니다.
- 출처: [OpenStreetMap / ODbL](https://www.openstreetmap.org/copyright), [브이월드](https://www.vworld.kr/), [대구공공시설관리공단 관리현황](https://portal.dpfc.or.kr/sub.php?Page1=2&Page2=1&Page3=1). 원본 API 응답과 인증키는 Git에 포함하지 않습니다.

### 차량 디스플레이 · 음성 안내 · 최종 모델 적용 준비

- LCD 차광판은 앞유리 상단 프레임의 고정 브래킷·슬라이드 지지대로 연결하며 해가 지나는 육각형 칸만 어둡게 합니다. 켜면 펼쳐지고 끄면 상단 힌지로 접혀 올라가는 약 0.7초의 모션을 사용합니다. 고개 이동에 따른 눈 위치와 판의 이동·회전·투명도를 함께 계산하고, 건물·지붕에 가려지거나 흐림 조건이면 차광 칸을 해제합니다. 순응·출구 효과와 저장된 모델 경고는 별도로 유지합니다. 얼굴 추적이나 실제 장치 제어가 아닌 시뮬레이터 기하 연출입니다.
- 메인과 주행 화면에서 기존 눈치 로고와 노랑·주황 강조색을 공유합니다. 내비 경고는 중앙 안내 띠에 표시하며, 밝기 변화 안내는 행동 문구와 함께 크게 표시합니다. 평상시 빛 번짐·유리 반사·전역 흐림은 줄이고 출구의 일시적인 밝기 적응은 유지했습니다. 가로수는 공통 가지 형상·겹치는 수관·나무껍질 질감과 개체별 방향·크기·녹색 명암 차이를 사용합니다.
- 차량 안에 내비 중심의 짧은 약 2.4:1 디스플레이를 배치했습니다. 큰 속도계는 없애고 지도 구석에 작은 속도를 표시합니다. 실제 도로·주변 도로 2,145개·건물 윤곽·하천·공원을 로컬 자산으로 그려 경로, 현재 위치, 남은 거리와 주의 구간을 표시합니다. GPS나 외부 길찾기 서비스는 사용하지 않습니다.
- 주행 HUD는 상단의 코스·진행률·시간과 하단 속도·도구로 정리했습니다. 운전석 시점에서는 차량 디스플레이가 경로·주의 안내를 담당하고, 추적 시점에서만 외부 미니맵을 표시합니다. 밝기 적응 상태는 필요한 구간에 작은 보조 표시로 나타납니다.
- 메인은 햇빛·터널 일러스트와 밝은 코스 카드로 체험을 구분합니다. 지도는 전체 도로로 시작하며 선택 코스 확대·전체 화면·드래그·두 손가락 확대를 지원합니다. 모바일 세로에서는 코스 바로 다음에 지도를 배치하고 상세 설정을 접어둡니다. 모바일 차량 디스플레이는 내비 중심으로 확대하고, 터치 도구에 스포츠 모드·시야 안내·설정을 제공합니다. 차량 내비에는 조건이 일치하는 저장된 사진 모델 판정과 현재 3D 시야 경고를 출처별로 구분해 표시하며, 심한 눈부심은 중앙 감속 안내·빨간 테두리로 강조합니다.
- 출발 버튼을 누르면 브라우저의 한국어 음성 합성으로 안내합니다. 음성/시야 안내를 각각 켜고 끌 수 있고, 메뉴 복귀·휴대폰 열기·엔진 종료 때 발화를 정리합니다. 동일 안내의 반복과 오래된 거리 안내의 누적을 막습니다. 음성 지원과 발음은 기기에 설치된 TTS에 따릅니다.
- 추천 코스는 7개입니다. 신천대로 첫 추천은 침산교 지붕 약 191 m 관찰 코스이며, 40 km/h에서 지붕 아래 약 17.2초입니다. 중동교 약 93 m·8.4초와 같은 조건으로 비교하며 관찰 상한 40/60/80 또는 자유 주행을 선택할 수 있습니다. [코스·모델 범위 점검](docs/코스_관찰_점검_2026-11-06.md)에 체험과 검증의 차이를 기록했습니다.
- iM뱅크 코스는 1.0 km·4/5 18:00, 겨울 아침은 12/20 08:25, 늦겨울 퇴근길은 2/20 17:10을 유지합니다. 건물·차체 차폐를 포함한 코스당 12지점 3D 점검은 실제 운전자/ML 성능이 아닙니다.
- `npm run prepare:routes`는 코스 적합성을 검사하고 7코스×3날씨의 구간별 입력만 `route_inputs.json`에 준비합니다. 지붕별 길이·속도별 시간과 결과는 `course_audit.json`에 보존합니다. 추천 코스는 시간 흐름을 고정하며 설정에서 변경할 수 있습니다.
- **발표 선정 모델을 적용했습니다.** 대표 코스 3개(달구벌대로·맑음)는 운전석 화면을 100 m마다 찍어 선정 모델 API(`/predict/glare/photo-g`)로 판정한 결과를 `route_analysis.json`에 저장했고, 주행 중 왼쪽 아래에 「태양광 눈부심 판정 · 선정 모델」로 지금·앞 구간 등급을 보여 줍니다. 저장 결과를 읽는 연결부는 `status=final`과 일치하는 도로·날짜·시간·날씨·방향만 받으며, 시뮬레이터 화면 판정이라 실제 도로 사진·도로변 카메라 판정이 아닙니다. 카메라 앱의 시뮬레이터 화면도 같은 모델로 실시간 판정합니다.
- `python scripts/build_navigation_context.py`는 기존에 받은 OSM 캐시에서 지도 배경 자산을 다시 만듭니다. 새로 수집하는 API 호출은 없습니다.
- 서버 응답은 `scripts/.*cache*.json`에 저장돼 다시 돌릴 때 빠르고, git에는 안 올라가요

</details>

<details>
<summary><b>🤝 작업 규칙</b> (펼치기)</summary>

<br/>

| 항목 | 규칙 |
|---|---|
| 🌿 브랜치 | `feat/` 기능 · 실험 · `fix/` 버그 · `docs/` 문서 · `refactor/` 정리 · `data/` 데이터 처리 + 짧은 설명 (예: `feat/lgbm-baseline`) |
| ✍️ 커밋 | `feat: 베이스라인 모델 추가`처럼 접두어 + 한 줄 |
| 🔀 병합 | `main`에 바로 올리지 않고 PR → squash 병합 |
| 💬 공유 | 착수 전 슬랙 `[작업 시작]`, 병합 후 `[작업 정리]` + 노션 카드에 PR 링크 |
| 🔍 리뷰 | 코멘트 등급 P1 꼭 고침 · P2 고치면 좋음 · P3 의견 |
| 🏷️ 라벨 | 브랜치 이름으로 자동으로 붙음 |

📘 파일 이름 규칙 · 올리면 안 되는 것 · 설치 없이 웹에서 올리는 법: [노션 「GitHub 컨벤션」](https://app.notion.com/p/c86986ef9f3a4a3caedabfc16b6ff0b7)

</details>
