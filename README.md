# ⭐ Awesome Stars Wiki

[![Update Wiki](https://github.com/eeeunhey/awesome-stars/actions/workflows/update-wiki.yml/badge.svg)](https://github.com/eeeunhey/awesome-stars/actions/workflows/update-wiki.yml)

내가 GitHub에서 ⭐ Star 클릭한 저장소들을 **자동으로 수집하고, 카테고리별로 Wiki에 정리**합니다.  
GitHub Actions에서 **매일 00:00 (KST)** 에 실행되어 최신 상태로 유지됩니다.


---

## 📚 목적
- 다시 보고 싶은 레포를 한눈에 정리  
- **웹 / AI / 데이터 / 자동화 / 디자인 등 카테고리별 분류**  
- 각 레포 옆 `📝 노트` 링크 → “왜 저장했는지 / 어떻게 활용할지” 기록  

---

## 📖 Wiki 바로가기
👉 **[Wiki 열기](https://github.com/eeeunhey/awesome-stars/wiki)**

### 카테고리별 페이지
- [웹 & 프론트엔드 (Web & Frontend)](https://github.com/eeeunhey/awesome-stars/wiki/웹-&-프론트엔드-(Web-&-Frontend))  
- [인공지능 / 머신러닝 (AI / ML)](https://github.com/eeeunhey/awesome-stars/wiki/인공지능---머신러닝-(AI---ML))  
- [데이터 & 처리 (Data & Processing)](https://github.com/eeeunhey/awesome-stars/wiki/데이터-&-처리-(Data-&-Processing))  
- [시각화 & 도구 (Visualization & Tool)](https://github.com/eeeunhey/awesome-stars/wiki/시각화-&-도구-(Visualization-&-Tool))  
- [자동화 (Automation)](https://github.com/eeeunhey/awesome-stars/wiki/자동화-(Automation))  
- [디자인 & AI 연동 (Design & AI Integration)](https://github.com/eeeunhey/awesome-stars/wiki/디자인-&-AI-연동-(Design-&-AI-Integration))  
- [백엔드 & 런타임 (Backend & Runtime)](https://github.com/eeeunhey/awesome-stars/wiki/백엔드-&-런타임-(Backend-&-Runtime))  
- [학습 & 스터디 (Learning & Study)](https://github.com/eeeunhey/awesome-stars/wiki/학습-&-스터디-(Learning-&-Study))  
- [리소스 / 자료 모음 (Resources)](https://github.com/eeeunhey/awesome-stars/wiki/리소스---자료-모음-(Resources))  
- [확장 & 기타 (Extensions & Others)](https://github.com/eeeunhey/awesome-stars/wiki/확장-&-기타-(Extensions-&-Others))  
- [기타 / 미분류](https://github.com/eeeunhey/awesome-stars/wiki/기타---미분류)  

> ⚠️ 스크립트가 생성하는 페이지 이름 규칙에 맞춰진 링크입니다.  
> 카테고리명을 변경하면 링크도 함께 바꿔야 합니다.

---

## 🗒️ 레포별 노트
각 레포 항목에는 `📝 노트` 링크가 달립니다.  
처음 생성될 때는 아래 템플릿이 자동 작성됩니다. (기존 노트는 덮어쓰지 않음)

```md
# <제목>

**왜 별을 눌렀나요**
- 

**사용법 / 팁**
- 

**링크**
- <레포_URL>

---

## ⚙️ 자동화 동작

- **스케줄**: 매일 00:00 (KST)  
- **스크립트**: `scripts/update-wiki.js`  
- **워크플로**: `.github/workflows/update-wiki.yml`  

### 동작 순서
1. 내 Starred Repos 수집  
2. `config/lists.yml` 규칙 + 키워드 기반 카테고리 분류  
3. `wiki/` 디렉토리에 카테고리 페이지 생성  
4. `wiki/notes/`에 레포별 노트 자동 생성 (없을 때만)  
5. 자동 커밋 & 푸시  

---

## 🚀 빠른 시작

1. 레포를 **포크/클론**  
2. **PAT 발급** 후 GitHub → `Settings → Secrets → Actions` → `STAR_TOKEN` 등록  
3. Wiki 탭에서 **Home.md 생성** (위키 초기화용, 최초 1회만 필요)  
4. Actions → `Update Wiki from Stars` 워크플로 **수동 실행**  
   (또는 스케줄 실행을 기다리면 자동 반영)  

> Wiki는 `.wiki.git`이라는 **별도 저장소**이므로 최초 한 번 초기화가 필요합니다.  

---

## 🧩 커스터마이즈 방법

### 1) 카테고리 규칙 (`config/lists.yml`)
```yml
lists:
  - name: "웹 & 프론트엔드 (Web & Frontend)"
    repos: []                       # 특정 레포 강제 포함 (owner/name)
    include_keywords: ["react","next","ui","tailwind","shadcn"]
    include_topics:   ["frontend","react","nextjs"]
    exclude_keywords: []
# … 다른 카테고리 추가
```

### 2) 레포별 노트/제목 (`config/notes.yml`)
```yml
notes:
  "n8n-io/n8n":
    title: "n8n — 내가 쓰는 자동화 허브"
    memo:  "반복 작업을 시각적 플로우 + 코드로 빠르게 자동화."
    desc:  ""          # 선택: 목록에 보일 짧은 설명(미작성 시 원문/토픽)
    show_original: false
```

> 목록 표시는 **제목 1줄 + 아래 한 줄(링크·설명·📝노트·⭐)** 형태로 출력됩니다.  
> 한 줄 스타일을 원하면 `TITLE_STYLE=inline` 환경변수를 워크플로에 설정하세요.

---

## 🗂 폴더 구조
```
.
├── scripts/
│   └── update-wiki.js        # 메인 스크립트
├── config/
│   ├── lists.yml             # 카테고리 규칙
│   └── notes.yml             # 레포별 제목/메모/옵션
├── .github/workflows/
│   └── update-wiki.yml       # GitHub Actions 워크플로
└── (생성됨) wiki/             # 위키 클론 후, 카테고리/노트 페이지 생성
    ├── Home.md
    ├── ...카테고리.md
    └── notes/
        └── owner__repo.md
```

---

## ✅ 기타
- `.gitignore`에 `wiki/`를 추가해 **메인 레포 커밋에 포함되지 않도록** 권장합니다. (Wiki는 별도 저장소)
- 워크플로의 Cleanup 스텝으로 루트의 옛 페이지를 정리하고 `notes/`만 유지합니다.
- 시간은 KST 기준으로 표시되며(러너 `TZ=Asia/Seoul`), Home 상단의 “마지막 업데이트”도 KST로 표기합니다.
