<div align="center">

<img src="https://raw.githubusercontent.com/Nunchi-ML/.github/main/profile/assets/logo.png" width="96" alt="Nunchi-ML"/>

# Nunchi-ML_FE

☀️ 운전석 햇빛 시뮬레이터 — 달리면서 눈부심 위험 예측을 보는 화면

![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB) ![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white) ![three.js](https://img.shields.io/badge/three.js-000000?style=flat-square&logo=threedotjs&logoColor=white) ![react--three--fiber](https://img.shields.io/badge/react--three--fiber-222222?style=flat-square) ![zustand](https://img.shields.io/badge/zustand-443E38?style=flat-square) ![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-222222?style=flat-square&logo=githubpages&logoColor=white)

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
| 배포 | GitHub Pages |

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
