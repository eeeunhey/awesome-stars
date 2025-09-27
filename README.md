# ⭐ Awesome Stars Wiki

[![Update Wiki](https://github.com/<YOUR-ID>/<YOUR-REPO>/actions/workflows/update-wiki.yml/badge.svg)](https://github.com/<YOUR-ID>/<YOUR-REPO>/actions/workflows/update-wiki.yml)

내가 GitHub에서 ⭐ Star한 저장소들을 **자동으로 수집하고 카테고리별로 분류하여 Wiki에 정리**하는 저장소입니다.  
GitHub Actions가 주기적으로 실행되어 최신 상태를 유지합니다.

---

## 📚 목적
- 내가 관심 있게 본 레포들을 한눈에 볼 수 있도록 정리
- 웹, AI, 데이터, 학습, 개발도구, 모바일, 리소스 등 **카테고리별 분류**
- Wiki 페이지에서 자동으로 갱신

---

## 📖 Wiki 바로가기
👉 [Wiki 페이지 열기](https://github.com/<YOUR-ID>/<YOUR-REPO>/wiki)

- [웹 & 프론트엔드](https://github.com/<YOUR-ID>/<YOUR-REPO>/wiki/웹-&-프론트엔드)  
- [인공지능 / 머신러닝](https://github.com/<YOUR-ID>/<YOUR-REPO>/wiki/인공지능-머신러닝)  
- [데이터 & 처리](https://github.com/<YOUR-ID>/<YOUR-REPO>/wiki/데이터-&-처리)  
- [개발 도구 / 자동화](https://github.com/<YOUR-ID>/<YOUR-REPO>/wiki/개발-도구-자동화)  
- [모바일](https://github.com/<YOUR-ID>/<YOUR-REPO>/wiki/모바일)  
- [리소스 / 학습](https://github.com/<YOUR-ID>/<YOUR-REPO>/wiki/리소스-학습)  
- [기타 / 미분류](https://github.com/<YOUR-ID>/<YOUR-REPO>/wiki/기타-미분류)  

---

## ⚙️ 자동화
- **GitHub Actions**로 매주 월요일 새벽(한국 기준) 자동 실행
- `scripts/update-wiki.js`에서 Starred Repos를 불러와 카테고리에 맞게 정리
- 결과를 `wiki/` 디렉토리에 저장 후 자동 커밋 & 푸시

---

## 🗂️ 카테고리 기준
- **웹 & 프론트엔드** → React, Next.js, UI, Tailwind, shadcn …  
- **인공지능 / 머신러닝** → PyTorch, LLM, Deep Learning, RAG …  
- **데이터 & 처리** → SQL, Notebook, 데이터 분석 도구 …  
- **개발 도구 / 자동화** → GitHub Actions, ESLint, Git, MCP …  
- **모바일** → React Native, Swift, Android, iOS …  
- **리소스 / 학습** → Awesome Lists, 강의 자료, 예제 …  
- **기타 / 미분류** → 위 기준에 안 맞는 레포

---

## 🚀 시작하기
1. 이 리포를 포크하거나 클론합니다.
2. GitHub **Personal Access Token(PAT)** 발급 후 → `Settings → Secrets → Actions`에 `STAR_TOKEN`으로 등록합니다.
3. Actions 워크플로우를 수동 실행하거나 자동 실행을 기다리면 됩니다.

---

## 📌 참고
- Wiki는 별도의 Git 저장소 (`.wiki.git`)로 관리됩니다.
- 첫 실행 전 Wiki 탭에서 **Home.md**를 만들어야 커밋이 가능합니다.
