// scripts/update-wiki.js (ESM)
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { Octokit } from "@octokit/rest";

const WIKI_DIR = "wiki";                               // ./wiki 에 위키 저장소 클론됨
const octokit  = new Octokit({ auth: process.env.STAR_TOKEN });

/* ────────────────────────────── 유틸 ────────────────────────────── */
const ensureDir = (d) => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); };
const toFile    = (t) => t.replace(/[\/\\]/g, "-").replace(/\s+/g, "-");
const lineOf = (r) => {
  const full  = `${r.owner.login} / ${r.name}`;
  const desc  = (r.description || "").replace(/\r?\n/g, " ").trim();
  const stars = r.stargazers_count ?? 0;
  return `- [${full}](${r.html_url}) — ${desc}${stars ? `  ⭐ ${stars}` : ""}`;
};
function write(p, content) {
  // content += `\n<!-- updated: ${new Date().toISOString()} -->\n`; // 디버깅용
  fs.writeFileSync(p, content, "utf8");
  console.log("WROTE:", p, content.length, "bytes");
}

/* ───────────── 리스트 규칙 로딩 ───────────── */
function loadListsConfig() {
  const p = path.join("config", "lists.yml");
  if (!fs.existsSync(p)) return null;
  try {
    const doc = yaml.load(fs.readFileSync(p, "utf8"));
    const lists = Array.isArray(doc?.lists) ? doc.lists : null;
    if (lists) console.log(`[lists.yml] loaded lists: ${lists.length}`);
    return lists;
  } catch (e) {
    console.warn("[lists.yml] parse error:", e?.message);
    return null;
  }
}

/* repo가 규칙(rule)에 맞는지 */
function matchByRules(repo, rule) {
  const repoId = `${repo?.owner?.login}/${repo?.name}`.toLowerCase();
  const hay    = `${repo?.name ?? ""} ${repo?.description ?? ""}`.toLowerCase();
  const topics = Array.isArray(repo?.topics)
    ? repo.topics.map(t => String(t).toLowerCase())
    : [];

  if (Array.isArray(rule.repos) &&
      rule.repos.some(x => x.toLowerCase() === repoId)) return true;

  if (Array.isArray(rule.exclude_keywords) &&
      rule.exclude_keywords.some(k => hay.includes(k.toLowerCase()))) return false;

  if (Array.isArray(rule.include_keywords) &&
      rule.include_keywords.some(k => hay.includes(k.toLowerCase()))) return true;

  if (Array.isArray(rule.include_topics) &&
      topics.some(t => rule.include_topics.some(k => t.includes(k.toLowerCase())))) return true;

  return false;
}

/* ───────────── (백업) 키워드 카테고리 ───────────── */
const FALLBACK_CATS = [
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
  "인공지능 / 머신러닝 (AI / ML)": ["pytorch","llm","rag","gemma","litgpt","finetune","ner","generate-sequences","kbla","execu","simpletuner","marimo","verifiers","lotus","orbital","ml","agent","ai"],
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
function pickFallbackCategory(repo) {
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

/* ─────────────⭐ 핵심: 응답 정규화 + 안전한 fetch ───────────── */
/** 리스트/유저 API 응답을 레포 객체 배열로 정규화 */
function normalizeStarItems(items) {
  return (items ?? [])
    .map(it => (it && it.repo) ? it.repo : it)       // star 이벤트(e.repo)면 repo만 꺼내고, 이미 레포면 그대로
    .filter(r => r && r.owner && r.owner.login && r.name);
}

/** 인증 스타 → 0건이면 공개 스타 폴백. topics는 "새 객체"에 채워서 반환 */
async function fetchStarred(username) {
  // 1) 인증 사용자 기준
  const authItems = await octokit.paginate(
    octokit.activity.listReposStarredByAuthenticatedUser,
    { per_page: 100 }
  );
  let base = normalizeStarItems(authItems);
  console.log("[fetchStarred] authenticated repos:", base.length);

  // 2) 0건이면 공개 스타 폴백
  if (base.length === 0 && username) {
    console.log("[fetchStarred] fallback → public stars of", username);
    const pubItems = await octokit.paginate(
      octokit.activity.listReposStarredByUser,
      { username, per_page: 100 }
    );
    base = normalizeStarItems(pubItems);
    console.log("[fetchStarred] public repos:", base.length);
  }

  // 3) topics 보강(상위 300개만). 실패해도 계속 진행.
  const out = [];
  for (let i = 0; i < base.length; i++) {
    const r = base[i];
    if (!r?.owner?.login || !r?.name) continue;

    let names = [];
    if (i < 300) {
      try {
        const tr = await octokit.repos.getAllTopics({
          owner: r.owner.login,
          repo: r.name,
        });
        names = Array.isArray(tr?.data?.names) ? tr.data.names : [];
      } catch { /* ignore 404/권한/레이트리밋 */ }
    }

    // 원본을 건드리지 않고, 항상 topics 배열이 있는 "새 객체"로 반환
    out.push({ ...r, topics: names });
  }

  console.log("[fetchStarred] sample:", out.slice(0, 5).map(x => `${x.owner.login}/${x.name}`));
  return out;
}

/* ───────────── 렌더 ───────────── */
function renderHomeFromGroups(groups, order) {
  const now = new Date().toISOString();
  let out = `# ⭐ Starred Repos (자동 생성)\n\n> 마지막 업데이트: ${now}\n\n`;
  for (const name of order) {
    const list = groups[name] || [];
    if (!list.length) continue;
    out += `- [[${name}|${toFile(name)}]] (${list.length})\n`;
  }
  return out + "\n";
}

/* ───────────── 메인 ───────────── */
const main = async () => {
  console.log("== Stars → Wiki (ESM) ==");
  if (!process.env.STAR_TOKEN) {
    console.warn("[warn] STAR_TOKEN is empty; rate limit/visibility may be limited.");
  }

  const me = await octokit.users.getAuthenticated();
  console.log("Authenticated as:", me.data.login);

  const starred = await fetchStarred(me.data.login);
  console.log("Starred (final count):", starred.length);

  const listsCfg = loadListsConfig();
  const groups = {};

  if (listsCfg && listsCfg.length) {
    // ✅ YAML 기반 “리스트” 분류
    for (const r of starred) {
      let hit = 0;
      for (const rule of listsCfg) {
        if (matchByRules(r, rule)) {
          (groups[rule.name] ||= []).push(r);
          hit++;
        }
      }
      if (hit === 0) (groups[UNC] ||= []).push(r);
    }

    Object.values(groups).forEach((list) =>
      list.sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0))
    );

    ensureDir(WIKI_DIR);
    const order = [...listsCfg.map(l => l.name), UNC];
    write(path.join(WIKI_DIR, "Home.md"), renderHomeFromGroups(groups, order));

    for (const name of order) {
      const list = groups[name] || [];
      if (!list.length) continue;
      const body = `# ${name}\n\n` + list.map(lineOf).join("\n") + "\n";
      write(path.join(WIKI_DIR, `${toFile(name)}.md`), body);
    }
  } else {
    // 🔁 lists.yml 없으면 키워드 분류 사용
    for (const r of starred) {
      const cat = pickFallbackCategory(r);
      (groups[cat] ||= []).push(r);
    }
    Object.values(groups).forEach((list) =>
      list.sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0))
    );

    ensureDir(WIKI_DIR);
    const order = [...FALLBACK_CATS, UNC];
    write(path.join(WIKI_DIR, "Home.md"), renderHomeFromGroups(groups, order));
    for (const name of order) {
      const list = groups[name] || [];
      if (!list.length) continue;
      const body = `# ${name}\n\n` + list.map(lineOf).join("\n") + "\n";
      write(path.join(WIKI_DIR, `${toFile(name)}.md`), body);
    }
  }

  const files = fs.readdirSync(WIKI_DIR).filter((f) => f.endsWith(".md"));
  console.log("Generated files:", files);
};

main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
