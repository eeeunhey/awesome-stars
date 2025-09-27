// Node 20 + ESM. package.json에 "type":"module" 필요
// 환경변수: STAR_TOKEN, GITHUB_REPOSITORY (액션이 넣어줌)

import fs from "fs";
import path from "path";
import { Octokit } from "@octokit/rest";

const octokit = new Octokit({ auth: process.env.STAR_TOKEN });
const WIKI_DIR = "wiki";

// ⬇️ GitHub Lists와 동일한 카테고리 이름을 그대로 사용합니다.
const CATS = [
  { name: "확장 & 기타 (Extensions & Others)", keywords: ["mlxtend","extension","helper","simple","toolkit","snake","snk","verifiers","Excalidraw","build-your-own-x","gitanimals"] },
  { name: "자동화 (Automation)", keywords: ["actions","github-actions","runner","act","n8n","hook","lefhook","mcp","server","opencode"] },
  { name: "웹 & 프론트엔드 (Web & Frontend)", keywords: ["react","next","mui","material","shadcn","tailwind","vercel","ui","form","tinymce","reveal","resumable","velite","orval","image-url","darkmode","legid","rrweb","liquid-glass","ts-brand","lenses","base-ui","magicui","ai-elements"] },
  { name: "인공지능 / 머신러닝 (AI / ML)", keywords: ["pytorch","llm","rag","deep","gemma","huggingface","litgpt","finetune","ner","generate-sequences","marimo","kbla","execu","SimpleTuner","verifiers","gemma","lotus","orbital"] },
  { name: "리소스 / 자료 모음 (Resources)", keywords: ["awesome","list","devteam","profile-readme","dev-conf-replay","resources"] },
  { name: "학습 & 스터디 (Learning & Study)", keywords: ["book","course","lecture","stat453","retreat","study","examples","tutorial","MachineLearning-QandAI"] },
  { name: "디자인 & AI 연동 (Design & AI 연동)", keywords: ["figma","design","MCP","Figma-Context"] },
  { name: "백엔드 & 런타임 (Backend & Runtime)", keywords: ["nodejs","node","runtime"] },
  { name: "시각화 & 도구 (Visualization & Tool)", keywords: ["matplotlib","watermark","plot","fastplotlib"] },
  { name: "데이터 & 처리 (Data & Processing)", keywords: ["sql","pandas","notebook","dataset","lotus","orbital","marimo","sklearn","data"] },
];

// 수동 오버라이드(정확히 넣고 싶은 레포 → 카테고리 이름) 옵션
const OVERRIDES = {
  // 예: "google-deepmind/gemma": "인공지능 / 머신러닝 (AI / ML)",
  //     "mui/material-ui": "웹 & 프론트엔드 (Web & Frontend)",
};

const safe = (s = "") => (s || "").toLowerCase();
const ensureDir = (p) => { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); };
const toFile = (title) => title.replace(/[\/\\]/g, "-").replace(/\s+/g, "-");

function mdLine(repo) {
  const full = `${repo.owner.login} / ${repo.name}`;
  const desc = (repo.description || "").replace(/\r?\n/g, " ").trim();
  const stars = repo.stargazers_count ?? 0;
  return `- [${full}](${repo.html_url}) — ${desc}${stars ? `  ⭐ ${stars}` : ""}`;
}

function chooseCategory(repo) {
  const override = OVERRIDES[`${repo.owner.login}/${repo.name}`];
  if (override) return override;

  const hay = safe(`${repo.name} ${repo.description || ""}`);
  const topics = (repo.topics || []).map(safe);

  for (const c of CATS) {
    if (c.keywords.some(k => hay.includes(k))) return c.name;
    if (topics.some(t => c.keywords.some(k => t.includes(k)))) return c.name;
  }
  return "기타 / 미분류";
}

async function fetchAllStarred() {
  let page = 1, per_page = 100, all = [];
  while (true) {
    const { data } = await octokit.activity.listReposStarredByAuthenticatedUser({ per_page, page });
    const repos = data.map(x => x.repo);
    all = all.concat(repos);
    if (repos.length < per_page) break;
    page++;
  }

  // 토픽 보강(상위 300개만 상세 조회)
  for (const r of all.slice(0, 300)) {
    try {
      const { data } = await octokit.repos.getAllTopics({ owner: r.owner.login, repo: r.name });
      r.topics = data.names || [];
    } catch { r.topics = r.topics || []; }
  }
  return all;
}

function group(repos) {
  const g = {};
  repos.forEach(r => {
    const key = chooseCategory(r);
    g[key] ||= [];
    g[key].push(r);
  });
  Object.values(g).forEach(list =>
    list.sort((a,b)=>(b.stargazers_count||0)-(a.stargazers_count||0))
  );
  return g;
}

function writeWiki(groups) {
  ensureDir(WIKI_DIR);

  // Home.md (목차)
  const now = new Date().toISOString();
  let home = `# ⭐ Starred Repos (자동 생성)\n\n> 마지막 업데이트: ${now}\n\n`;
  const order = [...CATS.map(c => c.name), "디자인 & AI 연동 (Design & AI 연동)", "기타 / 미분류"];
  for (const name of order) {
    const list = groups[name] || [];
    if (!list.length) continue;
    const fname = toFile(`${name}.md`).replace(/\.md$/, "");
    home += `- [[${name}|${fname}]] (${list.length})\n`;
  }
  fs.writeFileSync(path.join(WIKI_DIR, "Home.md"), home, "utf8");

  // 각 카테고리 페이지
  for (const [name, list] of Object.entries(groups)) {
    const body = `# ${name}\n\n` + list.map(mdLine).join("\n") + "\n";
    fs.writeFileSync(path.join(WIKI_DIR, toFile(`${name}.md`)), body, "utf8");
  }
}

(async () => {
  const me = await octokit.users.getAuthenticated();
  console.log("Authenticated as", me.data.login);

  const starred = await fetchAllStarred();
  if (!starred.length) { console.log("No starred repos."); return; }

  const groups = group(starred);
  writeWiki(groups);
  console.log("Wiki pages written.");
})().catch(e => { console.error(e); process.exit(1); });
