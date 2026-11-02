<div align="center">

<img src="https://raw.githubusercontent.com/Nunchi-ML/.github/main/profile/assets/logo.png" width="96" alt="Nunchi-ML"/>

# Nunchi-ML_FE

☀️ 운전석 햇빛 시뮬레이터 — 달리면서 눈부심 위험 예측을 보는 화면

![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB) ![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white) ![three.js](https://img.shields.io/badge/three.js-000000?style=flat-square&logo=threedotjs&logoColor=white) ![react--three--fiber](https://img.shields.io/badge/react--three--fiber-222222?style=flat-square) ![zustand](https://img.shields.io/badge/zustand-443E38?style=flat-square) ![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat-square&logo=vercel&logoColor=white)

[![Notion](https://img.shields.io/badge/Notion-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8%20%ED%99%88-000000?style=flat-square&logo=notion&logoColor=white)](https://app.notion.com/p/40554fa7e143815680c0cfb0ff414d78) [![GitHub](https://img.shields.io/badge/GitHub-Nunchi--ML-181717?style=flat-square&logo=github&logoColor=white)](https://github.com/Nunchi-ML)

</div>

---

## 👥 담당

FE · PM

## 🧰 기술 스택

| 하는 일 | 기술 |
|---|---|
| 화면 틀 | React · Vite · TypeScript |
| 3D 운전석 | three.js · react-three-fiber · drei |
| 눈부심 연출 | @react-three/postprocessing (빛 번짐 · 빛줄기 · 톤 매핑으로 눈 적응 표현) |
| 상태 (시간 · 위치 · 예측값) | zustand |
| 도로 · 건물 | OpenStreetMap 데이터 (달구벌대로 · 신천대로) |
| 배포 | Vercel — https://nunchi-drive.vercel.app (GitHub Actions 자동 배포) |

## 🎨 화면 — 노션 「웹사이트 명세」가 정본

| 화면 ID | 화면 | 보이는 것 |
|---|---|---|
| `S-01` | 🚗 운전석 시뮬레이터 | 날짜 · 시간을 바꾸면 해가 움직이고, 직접 달리며 역마다 예측 사고 건수 · 지금 화면의 눈부심 상태 |
| `S-02` | 🗺️ 위험 지도 | 달구벌대로 · 신천대로 구간별 예측 위험 · 내 위치 |
| `S-03` | 🏆 모델 결과 | 모델 ① · ② 검증 점수 · 비교 기준선 · 중요 변수 |
| `S-04` | 🎬 실제 영상 모드 | 유튜브 공식 플레이어 위에 위치 · 예측을 겹쳐 보기 |

> 발표 때는 시연하지 않고, 최종 모델 결과가 반영된 화면을 캡처해서 PPT에 넣어요.

## 📌 원칙

- 예측은 BE API(`/segments` · `/predict/risk` · `/predict/glare`)에서 받습니다
- **API가 안 되면 미리 뽑아 둔 JSON으로 자동 전환**합니다 — 발표 캡처가 서버 상태에 걸리지 않게
- 주고받는 형식은 노션 「웹사이트 명세」의 API 칸을 따릅니다

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

- 브이월드 스크립트는 `.env.local`의 `VWORLD_KEY`가 필요해요 (`VITE_` 붙이지 않기 — 사이트에 실리지 않게)
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
