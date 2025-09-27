// scripts/update-wiki.js
// Node 20, CommonJS(기본) 사용. 별도 "type":"module" 불필요.
// 필요 환경변수: STAR_TOKEN
const fs = require("fs");
const path = require("path");
const { Octokit } = require("@octokit/rest");

const WIKI_DIR = "wiki"; // ← 액션에서 wiki 저장소를 'wiki' 폴더로 clone했다고 가정
const octokit = new Octokit({ auth: process.env.STAR_TOKEN });

// === Lists와 같은 이름의 카테고리 ===
const CATS = [
  "확장 & 기타 (Extensions & Others)",
  "자동화 (Automation)",
  "웹 & 프론트엔드 (Web & Frontend)",
  "인공지능 / 머신러닝 (AI / ML)",
  "리소스 / 자료 모음 (Resources)",
  "학습 & 스터디 (Learning & Study)",
  "디자인 & AI 연동 (Design & AI Integration)",
  "백엔드 & 런타임 (Backend & Runtime)",
  "시각화 & 도구 (Visualization & Tool)",
  "데이터 & 처리 (Data & Processing)"
];

// 키워드 기반 자동 분류 (필요시 자유롭게 보강)
const KEYWORDS = {
  "웹 & 프론트엔드 (Web & Frontend)": ["react","next","mui","material","shadcn","tailwind","vercel","ui","form","rrweb","reveal","ts-brand","lenses","velite","orval","image-url","darkmode","legid","liquid-glass","base-ui","magicui","ai-elements","resumable"],
  "인공지능 / 머신러닝 (AI / ML)": ["pytorch","llm","rag","deep","huggingface","gemma","litgpt","finetune","ner","generate-sequences","kbla","execu","simpletuner","marimo","verifiers","lotus","orbital","ml","agent","ai"],
  "데이터 & 처리 (Data & Processing)": ["sql","pandas","dataset","sklearn","notebook","lotus","orbital","matplotlib"],
  "자동화 (Automation)": ["github-actions","actions","runner","act","n8n","hook","lefhook","mcp","server","opencode","codemod","resumable"],
  "시각화 & 도구 (Visualization & Tool)": ["matplotlib","watermark","plot","fastplotlib","excalidraw"],
  "백엔드 & 런타임 (Backend & Runtime)": ["nodejs","node","runtime"],
  "디자인 & AI 연동 (Design & AI Integration)": ["figma","design","mcp","context"],
  "학습 & 스터디 (Learning & Study)": ["book","course","lecture","stat453","retreat","study","examples","tutorial","qandai"],
  "리소스 / 자료 모음 (Resources)": ["awesome","list","profile-readme","devteam","dev-conf-replay"],
  "확장 & 기타 (Extensions & Others)": ["mlxtend","extension","helper","toolkit","snk","gitanimals","build-your-own-x"]
};

const UNC = "기타 / 미분류";

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function sanitizeTitleToFile(title) {
  // 위키 파일명: 공백/슬래시 → 하이픈
  return title.replace(/[\/\\]/g, "-").replace(/\s+/g, "-");
}

function lineOf(repo) {
  const full = `${repo.owner.login} / ${repo.name}`;
  const desc = (repo.description || "").replace(/\r?\n/g, " ").trim();
  const stars = repo.stargazers_count ?? 0;
  return `- [${full}](${repo.html_url}) — ${desc}${stars ? `  ⭐ ${stars}` : ""}`;
}

function pickCategory(repo) {
  const hay = `${repo.name} ${(repo.description || "")}`.toLowerCase();
  const topics = (repo.topics || []).map((t) => t.toLowerCase());

  // 1) 토픽/설명에서 키워드 매칭
  for (const [cat, kws] of Object.entries(KEYWORDS)) {
    if (kws.some(k => hay.includes(k)) || topics.some(t => kws.some(k => t.includes(k)))) {
      return cat;
    }
  }
  // 2) 기본: 기타
  return UNC;
}

async function fetchStarredAll() {
  let page = 1, per_page = 100, all = [];
  while (true) {
    const { data } = await octokit.activity.listReposStarredByAuthenticatedUser({ page, per_page });
    const repos = data.map(x => x.repo);
    all = all.concat(repos);
    if (repos.length < per_page) break;
    page++;
  }

  // 상위 300개 토픽 보강
  for (const r of all.slice(0, 300)) {
    try {
      const { data } = await octokit.repos.getAllTopics({ owner: r.owner.login, repo: r.name });
      r.topics = data.names || [];
    } catch { r.topics = r.topics || []; }
  }
  return all;
}

function renderHome(groups) {
  const now = new Date().toISOString();
  let out = `# ⭐ Starred Repos (자동 생성)\n\n> 마지막 업데이트: ${now}\n\n`;
  const order = [...CATS, UNC];
  for (const name of order) {
    const list = groups[name] || [];
    if (!list.length) continue;
    const fname = sanitizeTitleToFile(name);
    out += `- [[${name}|${fname}]] (${list.length})\n`;
  }
  return out + "\n";
}

function writeFileForce(p, content) {
  // 동일 내용이어도 타임스탬프 줄 하나 덧붙여 diff를 강제하고 싶다면 아래 주석 해제
  // content += `\n<!-- updated: ${new Date().toISOString()} -->\n`;
  fs.writeFileSync(p, content, "utf8");
  console.log("WROTE:", p, content.length, "bytes");
}

(async () => {
  try {
    console.log("== Stars → Wiki generator ==");
    const me = await octokit.users.getAuthenticated();
    console.log("Authenticated as:", me.data.login);

    const starred = await fetchStarredAll();
    console.log("Starred repos fetched:", starred.length);

    const groups = {};
    for (const r of starred) {
      const cat = pickCategory(r);
      groups[cat] ||= [];
      groups[cat].push(r);
    }
    // 정렬(스타수 내림차순)
    Object.values(groups).forEach(list => list.sort((a,b)=>(b.stargazers_count||0)-(a.stargazers_count||0)));

    ensureDir(WIKI_DIR);

    // Home.md
    writeFileForce(path.join(WIKI_DIR, "Home.md"), renderHome(groups));

    // 카테고리 페이지
    for (const [name, list] of Object.entries(groups)) {
      const body = `# ${name}\n\n` + list.map(lineOf).join("\n") + "\n";
      writeFileForce(path.join(WIKI_DIR, `${sanitizeTitleToFile(name)}.md`), body);
    }

    // 최소 보장 페이지(스타가 0개라도)
    if (!Object.keys(groups).length) {
      writeFileForce(path.join(WIKI_DIR, "Home.md"), "# ⭐ Starred Repos\n\n(아직 항목이 없습니다)\n");
    }

    // 생성물 요약
    const files = fs.readdirSync(WIKI_DIR).filter(f => f.endsWith(".md"));
    console.log("Generated files:", files);

  } catch (e) {
    console.error("ERROR:", e);
    process.exit(1); // 실패로 처리하여 액션에서 바로 보이게
  }
})();
