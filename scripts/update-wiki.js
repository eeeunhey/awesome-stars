// scripts/update-wiki.js  (ESM)
import fs from "fs";
import path from "path";
import { Octokit } from "@octokit/rest";

const WIKI_DIR = "wiki";                    // 액션에서 위키 저장소를 'wiki'로 clone한다고 가정
const octokit = new Octokit({ auth: process.env.STAR_TOKEN });

// 리스트 이름 동일 사용 + 키워드 매핑
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

const ensureDir = (d) => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); };
const toFile = (t) => t.replace(/[\/\\]/g, "-").replace(/\s+/g, "-");
const line = (r) => {
  const full = `${r.owner.login} / ${r.name}`;
  const desc = (r.description || "").replace(/\r?\n/g, " ").trim();
  const stars = r.stargazers_count ?? 0;
  return `- [${full}](${r.html_url}) — ${desc}${stars ? `  ⭐ ${stars}` : ""}`;
};

function pickCat(repo) {
  const hay = `${repo.name} ${(repo.description || "")}`.toLowerCase();
  const topics = (repo.topics || []).map((t) => t.toLowerCase());
  for (const [cat, kws] of Object.entries(KEYWORDS)) {
    if (kws.some(k => hay.includes(k)) || topics.some(t => kws.some(k => t.includes(k)))) return cat;
  }
  return UNC;
}

// 👉 기존 fetchStarred 함수 전체를 아래로 교체
async function fetchStarred() {
  let page = 1, per_page = 100, all = [];
  while (true) {
    const res = await octokit.activity.listReposStarredByAuthenticatedUser({ page, per_page });
    // repo가 null/undefined인 이벤트를 제거
    const repos = res.data.map(x => x.repo).filter(Boolean);
    all = all.concat(repos);
    if (repos.length < per_page) break;
    page++;
  }

  // 토픽 보강(상위 300개 정도만)
  for (const r of all.slice(0, 300)) {
    // owner/name이 없으면 건너뜀
    if (!r?.owner?.login || !r?.name) continue;
    try {
      const topicsRes = await octokit.repos.getAllTopics({
        owner: r.owner.login,
        repo: r.name,
      });
      r.topics = topicsRes?.data?.names ?? [];
    } catch {
      // 404/권한 문제 등은 무시
      r.topics = r.topics ?? [];
    }
  }
}

// 👉 기존 pickCategory 함수를 아래로 교체
function pickCategory(repo) {
  const hay = `${repo?.name ?? ""} ${repo?.description ?? ""}`.toLowerCase();
  const topics = Array.isArray(repo?.topics)
    ? repo.topics.map(t => String(t).toLowerCase())
    : [];

  for (const [cat, kws] of Object.entries(KEYWORDS)) {
    if (kws.some(k => hay.includes(k))) return cat;
    if (topics.some(t => kws.some(k => t.includes(k)))) return cat;
  }
  return UNC; // "기타 / 미분류"
}



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
  // 필요 시 항상 diff 나게 하려면 다음 줄 주석 해제
  // content += `\n<!-- updated: ${new Date().toISOString()} -->\n`;
  fs.writeFileSync(p, content, "utf8");
  console.log("WROTE:", p, content.length, "bytes");
}

const main = async () => {
  console.log("== Stars → Wiki (ESM) ==");
  const me = await octokit.users.getAuthenticated();
  console.log("Authenticated as:", me.data.login);

  const starred = await fetchStarred();
  console.log("Starred:", starred.length);

  const groups = {};
  for (const r of starred) {
    const cat = pickCat(r);
    (groups[cat] ||= []).push(r);
  }
  Object.values(groups).forEach(list =>
    list.sort((a,b)=>(b.stargazers_count||0)-(a.stargazers_count||0))
  );

  ensureDir(WIKI_DIR);
  write(path.join(WIKI_DIR, "Home.md"), renderHome(groups));

  for (const [name, list] of Object.entries(groups)) {
    const body = `# ${name}\n\n` + list.map(line).join("\n") + "\n";
    write(path.join(WIKI_DIR, `${toFile(name)}.md`), body);
  }

  if (!Object.keys(groups).length) {
    write(path.join(WIKI_DIR, "Home.md"), "# ⭐ Starred Repos\n\n(아직 항목이 없습니다)\n");
  }
};
main().catch(e => { console.error("ERROR:", e); process.exit(1); });
