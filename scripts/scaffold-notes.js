// scripts/scaffold-notes.js
import fs from "fs";
import yaml from "js-yaml";
import { Octokit } from "@octokit/rest";

const octokit = new Octokit({ auth: process.env.STAR_TOKEN });
const NOTES_PATH = "config/notes.yml";

function loadNotes() {
  if (!fs.existsSync(NOTES_PATH)) return { notes: {} };
  try { return yaml.load(fs.readFileSync(NOTES_PATH, "utf8")) || { notes: {} }; }
  catch { return { notes: {} }; }
}
function saveNotes(obj) {
  fs.mkdirSync("config", { recursive: true });
  fs.writeFileSync(NOTES_PATH, yaml.dump(obj, { lineWidth: 1000 }), "utf8");
}

function norm(items) {
  return (items || []).map(x => (x && x.repo) ? x.repo : x)
    .filter(r => r && r.owner && r.owner.login && r.name);
}

async function main() {
  const me = await octokit.users.getAuthenticated();
  const all = norm(await octokit.paginate(
    octokit.activity.listReposStarredByAuthenticatedUser, { per_page: 100 }
  ));
  const doc = loadNotes();
  doc.notes ||= {};

  let added = 0;
  for (const r of all) {
    const key = `${r.owner.login}/${r.name}`;
    if (!doc.notes[key]) {
      doc.notes[key] = {
        title: "",
        emoji: "",
        desc: "",
        tags: [],
        pin: false,
        order: 9999
      };
      added++;
    }
  }
  saveNotes(doc);
  console.log(`Scaffolded ${added} repo entries into ${NOTES_PATH}`);
}
main().catch(e => { console.error(e); process.exit(1); });
