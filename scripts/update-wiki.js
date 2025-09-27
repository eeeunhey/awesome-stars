// scripts/update-wiki.js — BASIC + notes + newline-title (ESM)
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { Octokit } from "@octokit/rest";

console.log("== Stars → Wiki (BASIC+NOTES) ==");

const WIKI_DIR   = "wiki";                                  // 위키 저장소 클론 위치
const NOTES_DIR  = path.join(WIKI_DIR, "notes");            // 수동/자동 노트 저장 경로
const TITLE_STYLE = (process.env.TITLE_STYLE || "inline")   // inline | newline
  .toLowerCase();
const NOTE_LABEL  = process.env.NOTE_LABEL || "노트";        // 전역 기본 링크 라벨
const NOTE_EMOJI  = process.env.NOTE_EMOJI || "";           // 전역 기본 이모지(예: "📝")

const octokit  = new Octokit({ auth: process.env.STAR_TOKEN });

/* ---------------- utils ---------------- */
const ensureDir = (d) => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); };
const toFile    = (t) => t.replace(/[\/\\]/g, "-").replace(/\s+/g, "-");
const write     = (p, content) => { fs.writeFileSync(p, content, "utf8"); console.log("WROTE:", p, content.length, "bytes"); };

/* ---------------- lists.yml loader ---------------- */
function loadListsConfig() {
  const p = path.join("config", "lists.yml");
  if (!fs.existsSync(p)) return null;
  try {
    const doc = yaml.load(fs.readFileSync(p, "utf8"));
    const lists = Array.isArray(doc?.lists) ? doc.lists : null;
    if (lists) console.log("[lists.yml] loaded:", lists.length);
    return lists;
  } catch (e) {
    console.warn("[lists.yml] parse error:", e?.message);
    return null;
  }
}

/* ---------------- notes.yml loader ---------------- */
function loadUserNotes() {
  const p = path.join("config", "notes.yml");
  if (!fs.existsSync(p)) return {};
  try {
    const doc = yaml.load(fs.readFileSync(p, "utf8"));
    const raw = doc?.notes || {};
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      if (!v) continue;
      out[k.toLowerCase()] = {
        title:        String(v.title || "").trim(),
        desc:         String(v.desc || "").trim(),
        link:         String(v.link || "").trim(),
        link_label:   String(v.link_label || "").trim(), // per-repo 라벨(이모지 포함 가능)
        show_original: !!v.show_original,
      };
    }
    console.log(`[notes.yml] loaded: ${Object.keys(out).length}`);
    return out;
  } catch (e) {
    console.warn("[notes.yml] parse error:", e?.message);
    return {};
  }
}
const USER_NOTES = loadUserNotes();

/* ---------------- fallback categories ---------------- */
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
  const topics = Array.isArray(repo?.topics) ? repo.topics.map(t => String(t).toLowerCase()) : [];
  for (const [cat, kws] of Object.entries(KEYWORDS)) {
    if (kws.some(k => hay.includes(k))) return cat;
    if (topics.some(t => kws.some(k => t.includes(k)))) return cat;
  }
  return UNC;
}

/* ---------------- fetching stars ---------------- */
function normalizeStarItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map(it => (it && it.repo) ? it.repo : it) // timeline 이벤트 형태 대응
    .filter(r => r && r.owner && r.owner.login && r.name);
}

async function fetchStarred(username) {
  let authItems = await octokit
    .paginate(octokit.activity.listReposStarredByAuthenticatedUser, { per_page: 100 })
    .catch(() => []);
  let base = normalizeStarItems(authItems);
  console.log("[fetchStarred] authenticated:", base.length);

  if (base.length === 0 && username) {
    const pubItems = await octokit
      .paginate(octokit.activity.listReposStarredByUser, { username, per_page: 100 })
      .catch(() => []);
    base = normalizeStarItems(pubItems);
    console.log("[fetchStarred] public:", base.length);
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

/* ---------------- render ---------------- */
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

/* ---------------- notes helpers ---------------- */
function ensureNoteFile(absPath, title = "Notes", repoUrl = "") {
  // 존재하면 그대로 보존(덮어쓰기 금지)
  if (fs.existsSync(absPath)) return;
  ensureDir(path.dirname(absPath));
  const body = `# ${title}

**Why I starred**
- 

**Usage / Tips**
- 

**Links**
- ${repoUrl}
`;
  fs.writeFileSync(absPath, body, "utf8");
}

/* ---------------- description builder ---------------- */
function getDescWithNote(repo) {
  const id   = `${repo.owner.login}/${repo.name}`.toLowerCase();
  const note = USER_NOTES[id];
  const original = (repo?.description || "").replace(/\r?\n/g, " ").trim();

  if (note?.desc && note?.show_original && original) {
    return `${original} · ${note.desc}`;
  }
  if (note?.desc) return note.desc;
  if (original) return original;

  const topics = Array.isArray(repo?.topics) ? repo.topics.slice(0, 3).join(", ") : "";
  return topics ? `Key topics: ${topics}` : `No description provided.`;
}

/* ---------------- one-line / two-line builder ---------------- */
function lineOf(r) {
  const id   = `${r.owner.login}/${r.name}`.toLowerCase();
  const note = USER_NOTES[id];

  const label = `${r.owner.login} / ${r.name}`;
  const link  = `[${label}](${r.html_url})`;
  const desc  = getDescWithNote(r);
  const star  = r.stargazers_count ? `  ⭐ ${r.stargazers_count}` : "";

  // 노트 링크 준비(+ 필요 시 템플릿 파일 1회 자동 생성)
  let notePart = "";
  if (note?.link) {
    const abs = path.isAbsolute(note.link) ? note.link : path.join(WIKI_DIR, note.link);
    const titleForNote = note?.title || `${r.name} — Notes`;
    ensureNoteFile(abs, titleForNote, r.html_url);

    const labelText = (note.link_label && note.link_label.trim())
      ? note.link_label.trim()
      : `${NOTE_EMOJI ? NOTE_EMOJI + " " : ""}${NOTE_LABEL}`;
    notePart = ` · [${labelText}](${note.link})`;
  }

  if (note?.title && TITLE_STYLE === "newline") {
    // 2줄 스타일
    return `- **${note.title}**\n  ${link} — ${desc}${notePart}${star}`;
  } else {
    // 1줄 스타일
    return `- ${link} — ${desc}${notePart}${star}`;
  }
}

/* ---------------- main ---------------- */
const main = async () => {
  const me = await octokit.users.getAuthenticated();
  console.log("Authenticated as:", me.data.login);

  const starred = await fetchStarred(me.data.login);
  console.log("Starred:", starred.length);

  const listsCfg = loadListsConfig();
  const groups = {};

  if (listsCfg && listsCfg.length) {
    // 규칙 기반 분류
    for (const r of starred) {
      let hit = 0;
      const repoId = `${r.owner.login}/${r.name}`.toLowerCase();
      const hay    = `${r.name} ${r.description || ""}`.toLowerCase();
      const topics = Array.isArray(r.topics) ? r.topics.map(t => t.toLowerCase()) : [];

      for (const rule of listsCfg) {
        const inRepos = Array.isArray(rule.repos) && rule.repos.some(x => x.toLowerCase() === repoId);
        const exKey   = Array.isArray(rule.exclude_keywords) && rule.exclude_keywords.some(k => hay.includes(k.toLowerCase()));
        const inKey   = Array.isArray(rule.include_keywords) && rule.include_keywords.some(k => hay.includes(k.toLowerCase()));
        const inTopic = Array.isArray(rule.include_topics) && topics.some(t => rule.include_topics.some(k => t.includes(k.toLowerCase())));
        if (!exKey && (inRepos || inKey || inTopic)) {
          (groups[rule.name] ||= []).push(r);
          hit++;
        }
      }
      if (hit === 0) (groups[UNC] ||= []).push(r);
    }
  } else {
    // 키워드 폴백
    for (const r of starred) {
      const cat = pickFallbackCategory(r);
      (groups[cat] ||= []).push(r);
    }
  }

  // 정렬: 스타 수 내림차순
  Object.values(groups).forEach(list =>
    list.sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0))
  );

  ensureDir(WIKI_DIR);
  ensureDir(NOTES_DIR);

  const order = (listsCfg && listsCfg.length)
    ? [...listsCfg.map(l => l.name), UNC]
    : [...FALLBACK_CATS, UNC];

  write(path.join(WIKI_DIR, "Home.md"), renderHomeFromGroups(groups, order));
  for (const name of order) {
    const list = groups[name] || [];
    if (!list.length) continue;
    const body = `# ${name}\n\n` + list.map(lineOf).join("\n") + "\n";
    write(path.join(WIKI_DIR, `${toFile(name)}.md`), body);
  }

  const files = fs.readdirSync(WIKI_DIR).filter(f => f.endsWith(".md"));
  console.log("Generated files:", files);
};

main().catch(e => { console.error("ERROR:", e); process.exit(1); });
