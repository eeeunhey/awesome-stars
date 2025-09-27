// scripts/update-wiki.js — vSAFE+KR-DESC (translate + summarize)
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { Octokit } from "@octokit/rest";

console.log("[BOOT] update-wiki.js vSAFE+KR-DESC");

const WIKI_DIR = "wiki"; // ./wiki 에 위키 저장소가 clone 되어있다고 가정
const octokit  = new Octokit({ auth: process.env.STAR_TOKEN });

/* ────────────────────────────── 공통 유틸 ────────────────────────────── */
const ensureDir = (d) => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); };
const toFile    = (t) => t.replace(/[\/\\]/g, "-").replace(/\s+/g, "-");
function write(p, content) {
  fs.writeFileSync(p, content, "utf8");
  console.log("WROTE:", p, content.length, "bytes");
}

/* ────────────────────────────── 번역/요약 유틸 ────────────────────────────── */
// 언어: TRANSLATE_TO > SUMMARY_LANG > 'ko'
const TARGET_LANG = (process.env.TRANSLATE_TO || process.env.SUMMARY_LANG || "ko").trim().toLowerCase();
const OPENAI_KEY  = (process.env.OPENAI_API_KEY || "").trim();
const DEEPL_KEY   = (process.env.DEEPL_API_KEY  || "").trim();

const CACHE_DIR = ".cache";
const T_CACHE   = path.join(CACHE_DIR, "translations.json");
const S_CACHE   = path.join(CACHE_DIR, "summaries.json");
ensureDir(CACHE_DIR);

let __tCache = {}; try { __tCache = JSON.parse(fs.readFileSync(T_CACHE, "utf8")); } catch {}
let __sCache = {}; try { __sCache = JSON.parse(fs.readFileSync(S_CACHE, "utf8")); } catch {}

function saveTC() { fs.writeFileSync(T_CACHE, JSON.stringify(__tCache, null, 2)); }
function saveSC() { fs.writeFileSync(S_CACHE, JSON.stringify(__sCache, null, 2)); }

// Markdown을 요약 전에 간단히 정제
function stripMarkdown(md = "") {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/#+\s+/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Deepl 또는 OpenAI로 단문 번역 (캐시)
async function translateOnce(text) {
  if (!text) return text;
  const key = `t:${TARGET_LANG}:${text}`;
  if (__tCache[key]) return __tCache[key];

  let out = text;
  try {
    if (DEEPL_KEY) {
      const body = new URLSearchParams({ text, target_lang: TARGET_LANG.toUpperCase() });
      const resp = await fetch("https://api-free.deepl.com/v2/translate", {
        method: "POST",
        headers: { "Authorization": `DeepL-Auth-Key ${DEEPL_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
        body
      });
      const data = await resp.json();
      out = data?.translations?.[0]?.text || text;
    } else if (OPENAI_KEY) {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0,
          messages: [
            { role: "system", content: `Translate to ${TARGET_LANG}. Keep repository/brand names in English.` },
            { role: "user", content: text }
          ]
        })
      });
      const data = await resp.json();
      out = data?.choices?.[0]?.message?.content?.trim() || text;
    }
  } catch {
    out = text;
  }
  __tCache[key] = out; saveTC(); return out;
}

// README 가져오기
async function fetchReadmeText(owner, repo) {
  try {
    const { data } = await octokit.repos.getReadme({ owner, repo });
    const buf = Buffer.from(data.content || "", "base64");
    return buf.toString("utf8");
  } catch { return ""; }
}

// OpenAI로 한 문장 한국어 요약 (설명 없을 때만 호출, 캐시)
async function summarizeToKO(text, repoFullName) {
  if (!OPENAI_KEY) return ""; // 키 없으면 요약 생략
  const base = stripMarkdown(text).slice(0, 3000); // 3k자만 사용
  if (!base) return "";
  const ckey = `s:${TARGET_LANG}:${repoFullName}:${base.slice(0,800)}`;
  if (__sCache[ckey]) return __sCache[ckey];

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: `Write ONE short Korean sentence (<=25 words) summarizing a GitHub repository. Keep repo/brand names (e.g., React, n8n) in English. No emojis/markdown.` },
          { role: "user", content: base }
        ]
      })
    });
    const data = await resp.json();
    const out = data?.choices?.[0]?.message?.content?.trim() || "";
    __sCache[ckey] = out; saveSC(); return out;
  } catch {
    return "";
  }
}

// 한국어 설명 생성기: (1) 원문 번역 → (2) README 요약 → (3) 토픽 템플릿
async function getKoreanDesc(repo) {
  const original = (repo?.description || "").replace(/\r?\n/g, " ").trim();
  if (original) return await translateOnce(original);

  const readme = await fetchReadmeText(repo.owner.login, repo.name);
  if (readme) {
    const sum = await summarizeToKO(readme, `${repo.owner.login}/${repo.name}`);
    if (sum) return sum;
  }

  const topics = Array.isArray(repo?.topics) ? repo.topics.slice(0, 3).join(", ") : "";
  if (topics) return `주요 주제: ${topics}`;
  return `프로젝트 개요 정보가 부족합니다.`;
}

/* ────────────────────────────── 리스트 규칙 ────────────────────────────── */
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

function matchByRules(repo, rule) {
  const repoId = `${repo?.owner?.login}/${repo?.name}`.toLowerCase();
  const hay    = `${repo?.name ?? ""} ${repo?.description ?? ""}`.toLowerCase();
  const topics = Array.isArray(repo?.topics) ? repo.topics.map(t => String(t).toLowerCase()) : [];

  if (Array.isArray(rule.repos) && rule.repos.some(x => x.toLowerCase() === repoId)) return true;
  if (Array.isArray(rule.exclude_keywords) && rule.exclude_keywords.some(k => hay.includes(k.toLowerCase()))) return false;
  if (Array.isArray(rule.include_keywords) && rule.include_keywords.some(k => hay.includes(k.toLowerCase()))) return true;
  if (Array.isArray(rule.include_topics) && topics.some(t => rule.include_topics.some(k => t.includes(k.toLowerCase())))) return true;
  return false;
}

/* ────────────────────────────── 키워드 폴백 분류 ────────────────────────────── */
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
  const topics = Array.isArray(repo?.topics) ? repo.topics.map((t) => String(t).toLowerCase()) : [];
  for (const [cat, kws] of Object.entries(KEYWORDS)) {
    if (kws.some((k) => hay.includes(k))) return cat;
    if (topics.some((t) => kws.some((k) => t.includes(k)))) return cat;
  }
  return UNC;
}

/* ────────────────────────────── 스타 목록 가져오기 ────────────────────────────── */
// 어떤 응답이 와도 "레포 객체 배열"로 통일
function normalizeStarItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map(it => (it && it.repo) ? it.repo : it) // e.repo 형태면 repo만 추출
    .filter(r => r && r.owner && r.owner.login && r.name);
}

// 인증 → 0건이면 공개 스타 폴백. 원본 수정 금지, 새 객체 topics 포함
async function fetchStarred(username) {
  let authItems = await octokit
    .paginate(octokit.activity.listReposStarredByAuthenticatedUser, { per_page: 100 })
    .catch(() => []);
  let base = normalizeStarItems(authItems);
  console.log("[fetchStarred] authenticated repos:", base.length);

  if (base.length === 0 && username) {
    const pubItems = await octokit
      .paginate(octokit.activity.listReposStarredByUser, { username, per_page: 100 })
      .catch(() => []);
    base = normalizeStarItems(pubItems);
    console.log("[fetchStarred] public repos:", base.length);
  }

  const out = [];
  let i = 0;
  for (const r of base) {
    if (!r?.owner?.login || !r?.name) continue;

    let names = [];
    if (i < 300) {
      try {
        const tr = await octokit.repos.getAllTopics({ owner: r.owner.login, repo: r.name });
        names = Array.isArray(tr?.data?.names) ? tr.data.names : [];
      } catch { names = []; }
    }

    out.push({
      owner: { login: r.owner.login },
      name: r.name,
      html_url: r.html_url,
      description: r.description ?? "",
      stargazers_count: r.stargazers_count ?? 0,
      topics: names,
    });
    i++;
  }
  console.log("[fetchStarred] sample:", out.slice(0, 5).map(x => `${x.owner.login}/${x.name}`));
  return out;
}

/* ────────────────────────────── 렌더 ────────────────────────────── */
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

// 한 줄(레포) → 한국어 설명 포함하여 생성
async function lineOfAsync(r) {
  const full  = `${r.owner.login} / ${r.name}`;
  const descK = await getKoreanDesc(r);
  const stars = r.stargazers_count ?? 0;
  return `- [${full}](${r.html_url}) — ${descK}${stars ? `  ⭐ ${stars}` : ""}`;
}

/* ────────────────────────────── 메인 ────────────────────────────── */
const main = async () => {
  console.log("== Stars → Wiki (ESM) ==");
  if (!process.env.STAR_TOKEN) console.warn("[warn] STAR_TOKEN missing; rate limit/visibility may be limited.");

  const me = await octokit.users.getAuthenticated();
  console.log("Authenticated as:", me.data.login);

  const starred = await fetchStarred(me.data.login);
  console.log("Starred (final count):", starred.length);

  const listsCfg = loadListsConfig();
  const groups = {};

  if (listsCfg && listsCfg.length) {
    // YAML 기반 분류 (중복 허용)
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

    Object.values(groups).forEach(list =>
      list.sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0))
    );

    ensureDir(WIKI_DIR);
    const order = [...listsCfg.map(l => l.name), UNC];
    write(path.join(WIKI_DIR, "Home.md"), renderHomeFromGroups(groups, order));

    for (const name of order) {
      const list = groups[name] || [];
      if (!list.length) continue;
      const lines = await Promise.all(list.map(lineOfAsync));
      const body  = `# ${name}\n\n` + lines.join("\n") + "\n";
      write(path.join(WIKI_DIR, `${toFile(name)}.md`), body);
    }
  } else {
    // 키워드 폴백 분류
    for (const r of starred) {
      const cat = pickFallbackCategory(r);
      (groups[cat] ||= []).push(r);
    }
    Object.values(groups).forEach(list =>
      list.sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0))
    );

    ensureDir(WIKI_DIR);
    const order = [...FALLBACK_CATS, UNC];
    write(path.join(WIKI_DIR, "Home.md"), renderHomeFromGroups(groups, order));

    for (const name of order) {
      const list = groups[name] || [];
      if (!list.length) continue;
      const lines = await Promise.all(list.map(lineOfAsync));
      const body  = `# ${name}\n\n` + lines.join("\n") + "\n";
      write(path.join(WIKI_DIR, `${toFile(name)}.md`), body);
    }
  }

  const files = fs.readdirSync(WIKI_DIR).filter(f => f.endsWith(".md"));
  console.log("Generated files:", files);
};

main().catch(e => { console.error("ERROR:", e); process.exit(1); });
