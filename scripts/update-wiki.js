// scripts/update-wiki.js (ESM)
import fs from "fs";
import path from "path";
import { Octokit } from "@octokit/rest";

const WIKI_DIR = "wiki";                               // ./wiki 에 위키 저장소 클론됨
const octokit  = new Octokit({ auth: process.env.STAR_TOKEN });

// ===== 카테고리 / 키워드 =====
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
  "데이터 & 처리 (Data & Processing)",
];
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
  "확장 & 기타 (Extensions & Others)": ["mlxtend","extension","helper","toolkit","snk","gitanimals","build-your-own-x"],
};
const UNC = "기타 / 미분류";

// ===== 유틸 =====
const ensureDir = (d) => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); };
const toFile    = (t) => t.replace(/[\/\\]/g, "-").replace(/\s+/g, "-");
const lineOf = (r) => {
  const full  = `${r.owner.login} / ${r.name}`;
  const desc  = (r.description || "").replace(/\r?\n/g, " ").trim();
  const stars = r.stargazers_count ?? 0;
  return `- [${full}](${r.html_url}) — ${desc}${stars ? `  ⭐ ${stars}` : ""}`;
};

function pickCategory(repo) {
  const hay = `${repo?.name ?? ""} ${repo?.description ?? ""}`.toLowerCase();
  const topics = Array.isArray(repo?.topics)
    ? repo.topics.map((t) => String(t).toLowerCase())
    : [];
  for (const [cat, kws] of Object.entries(KEYWORDS)) {
    if (kws.some((k) => hay.includes(k))) return cat;
    if (topics.some((t) => kws.some((k) => t.includes(k)))) return cat;
  }
  return UNC;
}

// ===== 스타 가져오기 (인증 → 0건이면 공개 스타 폴백) =====
async function fetchStarred(username) {
  // 1) 인증 사용자 기준(비공개 포함 가능)
  const authEvents = await octokit.paginate(
    octokit.activity.listReposStarredByAuthenticatedUser,
    { per_page: 100 }
  );
  let all = authEvents
    .map((e) => e?.repo)
    .filter((r) => r && r.owner && r.owner.login && r.name);

  console.log("[fetchStarred] authenticated stars:", all.length);

  // 2) 0건이면 공개 스타로 폴백
  if (all.length === 0 && username) {
    console.log("[fetchStarred] fallback → public stars of", username);
    const pubs = await octokit.paginate(
      octokit.activity.listReposStarredByUser,
      { username, per_page: 100 }
    );
    all = pubs
      .map((r) => r) // 이미 repo 객체
      .filter((r) => r && r.owner && r.owner.login && r.name);
    console.log("[fetchStarred] public stars fetched:", all.length);
  }

  // 3) 토픽 보강(상위 300개만). 실패해도 진행
  for (const r of all.slice(0, 300)) {
    try {
      const tr = await octokit.repos.getAllTopics({
        owner: r.owner.login, repo: r.name,
      });
      const names = Array.isArray(tr?.data?.names) ? tr.data.names : [];
      r.topics = Array.isArray(r.topics) ? r.topics : [];
      r.topics.push(...names);
    } catch {
      r.topics = Array.isArray(r.topics) ? r.topics : [];
    }
  }

  console.log("[fetchStarred] sample:", all.slice(0, 5).map(r => `${r.owner.login}/${r.name}`));
  return all;
}

// ===== 렌더 & 쓰기 =====
function renderHome(groups) {
  const now = new Date().toISOString();
  let out = `# ⭐ Starred Repos (자동 생성)\n\n> 마지막 업데이트: ${now}\n\n`;
  const order = [...CATS, UNC];
  for (const name of order) {
    const list = groups[name] || [];
    if (!list.length) continue;
    out += `- [[${name}|${toFile(name)}]] (${list.length})\n`;
  }
  return out + "\n";
}
function write(p, content) {
  // 디버깅 중 항상 변경 감지 원하면 아래 한 줄 주석 해제
  // content += `\n<!-- updated: ${new Date().toISOString()} -->\n`;
  fs.writeFileSync(p, content, "utf8");
  console.log("WROTE:", p, content.length, "bytes");
}

// ===== 메인 =====
const main = async () => {
  console.log("== Stars → Wiki (ESM) ==");
  if (!process.env.STAR_TOKEN) {
    console.warn("[warn] STAR_TOKEN is empty; rate limit/visibility may be limited.");
  }

  const me = await octokit.users.getAuthenticated();
  console.log("Authenticated as:", me.data.login);

  const starred = await fetchStarred(me.data.login);
  console.log("Starred (final count):", starred.length);

  const groups = {};
  for (const r of starred) {
    const cat = pickCategory(r);
    (groups[cat] ||= []).push(r);
  }
  Object.values(groups).forEach((list) =>
    list.sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0))
  );

  ensureDir(WIKI_DIR);
  write(path.join(WIKI_DIR, "Home.md"), renderHome(groups));

  for (const [name, list] of Object.entries(groups)) {
    const body = `# ${name}\n\n` + list.map(lineOf).join("\n") + "\n";
    write(path.join(WIKI_DIR, `${toFile(name)}.md`), body);
  }

  if (!Object.keys(groups).length) {
    write(path.join(WIKI_DIR, "Home.md"), "# ⭐ Starred Repos\n\n(아직 항목이 없습니다)\n");
  }

  const files = fs.readdirSync(WIKI_DIR).filter((f) => f.endsWith(".md"));
  console.log("Generated files:", files);
};

main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
