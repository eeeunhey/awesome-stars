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

/* ─────────────── config loaders ─────────────── */
function loadListsConfig() {
  const p = path.join("config", "lists.yml");
  if (!fs.existsSync(p)) return null;
  try {
    const doc = yaml.load(fs.readFileSync(p, "utf8"));
    const lists = Array.isArray(doc?.lists) ? doc.lists : null;
    if (lists) console.log(`[lists.yml] loaded: ${lists.length}`);
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

/* ─────────────── fallback categories ─────────────── */
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



// ✅ listReposStarredByAuthenticatedUser / listReposStarredByUser
// 어떤 형태가 와도 "레포 객체 배열"로 통일
function normalizeStarItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map(it => (it && it.repo) ? it.repo : it) // e.repo 형태면 repo만 추출
    .filter(r => r && r.owner && r.owner.login && r.name);
}

/** 인증 스타 → 0건이면 공개 스타 폴백. topics는 "새 객체"에 채워서 반환 */

// ✅ 인증 → 0건이면 공개 스타 폴백
// ✅ "원본 r"을 절대 수정하지 않고, 새 객체에 topics를 넣어 반환
// ✅ for-of로 순회(인덱스 접근 중간에 hole이 있어도 안전)
async function fetchStarred(username) {
  // 1) 인증 사용자 기준
  let authItems = await octokit.paginate(
    octokit.activity.listReposStarredByAuthenticatedUser,
    { per_page: 100 }
  ).catch(e => {
    console.warn("[fetchStarred] auth paginate error:", e?.status || e?.message);
    return [];
  });
  let base = normalizeStarItems(authItems);
  console.log("[fetchStarred] authenticated:", base.length);

  if (base.length === 0 && username) {
    console.log("[fetchStarred] fallback → public stars of", username);
    const pubItems = await octokit.paginate(
      octokit.activity.listReposStarredByUser,
      { username, per_page: 100 }
    ).catch(e => {
      console.warn("[fetchStarred] public paginate error:", e?.status || e?.message);
      return [];
    });
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
      } catch (e) {
        // 404/권한/레이트리밋 등은 무시
        names = [];
      }
    }

    // 🔸 원본 r을 건드리지 않고 새 객체로 반환 (topics는 항상 배열)
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

/* ─────────────── sorting & render ─────────────── */
function sortWithPin(a, b) {
  const idA = `${a.owner.login}/${a.name}`.toLowerCase();
  const idB = `${b.owner.login}/${b.name}`.toLowerCase();
  const na = USER_NOTES[idA], nb = USER_NOTES[idB];

  const pa = na?.pin ? 0 : 1, pb = nb?.pin ? 0 : 1;
  if (pa !== pb) return pa - pb;

  const oa = na?.order ?? 9999, ob = nb?.order ?? 9999;
  if (oa !== ob) return oa - ob;

  return (b.stargazers_count || 0) - (a.stargazers_count || 0);
}

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

/* ─────────────── description & line ─────────────── */
async function getDesc(repo) {
  const id   = `${repo.owner.login}/${repo.name}`.toLowerCase();
  const note = USER_NOTES[id];

  // 노트 첫 줄(옵션)
  if (NOTE_FIRSTLINE) {
    const p = ensureNotePage(repo);
    const first = p ? readNoteFirstLine(p) : "";
    if (first) return first;
  } else {
    // NOTE_FIRSTLINE=false라도 note 링크 위해 파일은 생성
    ensureNotePage(repo);
  }

  // notes.yml의 설명
  if (note?.desc) return note.desc;

  // 레포 description
  const original = (repo?.description || "").replace(/\r?\n/g, " ").trim();
  if (original) return original;

  // 토픽/기본 문구
  const topics = Array.isArray(repo?.topics) ? repo.topics.slice(0, 3).join(", ") : "";
  if (topics) return `Key topics: ${topics}`;
  return `No description provided.`;
}

// 한 줄 출력 (TITLE_STYLE: inline | newline)
async function lineOfAsync(r) {
  const id   = `${r.owner.login}/${r.name}`.toLowerCase();
  const note = USER_NOTES[id];

  const label = `${r.owner.login} / ${r.name}`;
  const emoji = note?.emoji ? `${note.emoji} ` : "";
  const link  = `[${label}](${r.html_url})`;

  const desc  = await getDesc(r);
  const tags  = (note?.tags?.length ? `  · ${note.tags.map(t => `\`${t}\``).join(" ")}` : "");
  const extra = note?.link ? `  · [link](${note.link})` : "";
  const star  = note?.hide_star ? "" : (r.stargazers_count ? `  ⭐ ${r.stargazers_count}` : "");

  // note 링크
  let notePart = "";
  const p = noteFileFor(r.owner.login, r.name);
  if (AUTO_NOTE_PAGE && fs.existsSync(p)) {
    notePart = `  · [note](notes/${path.basename(p)})`;
  }

  const title = (note?.title || "").trim();
  if (title && TITLE_STYLE === "newline") {
    return `- ${emoji}**${title}**\n  ${link} — ${desc}${tags}${extra}${notePart}${star}`;
  } else {
    const titlePart = title ? `**${title}** · ` : "";
    return `- ${emoji}${titlePart}${link} — ${desc}${tags}${extra}${notePart}${star}`;
  }
}

/* ─────────────── main ─────────────── */
const main = async () => {
  console.log("== Stars → Wiki (BASIC) ==");
  const me = await octokit.users.getAuthenticated();
  console.log("Authenticated as:", me.data.login);

  const starred = await fetchStarred(me.data.login);
  console.log("Starred:", starred.length);

  const listsCfg = loadListsConfig();
  const groups = {};

  if (listsCfg && listsCfg.length) {
    // ✅ YAML 기반 “리스트” 분류
    for (const r of starred) {
      let hit = 0;
      for (const rule of listsCfg) {
        const repoId = `${r.owner.login}/${r.name}`.toLowerCase();
        const hay    = `${r.name} ${r.description || ""}`.toLowerCase();
        const topics = Array.isArray(r.topics) ? r.topics.map(t => t.toLowerCase()) : [];
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
      const note = USER_NOTES[`${r.owner.login}/${r.name}`.toLowerCase()];
      const cat = note?.category ? note.category : pickFallbackCategory(r);
      (groups[cat] ||= []).push(r);
    }
    var order = [...FALLBACK_CATS, UNC];
  }

  // 정렬
  Object.values(groups).forEach(list => list.sort(sortWithPin));

  // 쓰기
  ensureDir(WIKI_DIR);
  write(path.join(WIKI_DIR, "Home.md"), renderHomeFromGroups(groups, order));

  for (const name of order) {
    const list = groups[name] || [];
    if (!list.length) continue;
    const lines = await Promise.all(list.map(lineOfAsync));
    const body  = `# ${name}\n\n` + lines.join("\n") + "\n";
    write(path.join(WIKI_DIR, `${toFile(name)}.md`), body);
  }

  const files = fs.readdirSync(WIKI_DIR).filter(f => f.endsWith(".md"));
  console.log("Generated files:", files);
};

main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
