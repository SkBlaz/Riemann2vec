import {readFile, writeFile} from "node:fs/promises";
import {chapters} from "../docs/guide.js";
import {chapterFields, navigation} from "../docs/guide-markup.js";

const file = new URL("../docs/index.html", import.meta.url);
let html = await readFile(file, "utf8");
const meta = JSON.parse(await readFile(new URL("../docs/data/meta.json", import.meta.url), "utf8"));
const num = n => n.toLocaleString("en-US");
const fields = {...chapterFields(chapters[0]), "proof-nav": navigation(chapters),
  "stat-lines": (meta.lines / 1e6).toFixed(1) + "M", "stat-files": num(meta.files), "stat-terms": num(meta.terms),
  version: `${num(meta.tokens)} training tokens across ${num(meta.files)} modules. ${meta.epochs} training epochs. Source commit ${meta.revision.slice(0,12)}.`,
};
for (const [id, contents] of Object.entries(fields)) {
  const pattern = new RegExp(`(<([a-z0-9]+)\\b[^>]* id="${id}"[^>]*>)[\\s\\S]*?(</\\2>)`);
  if (!pattern.test(html)) throw new Error("Missing entry element " + id);
  html = html.replace(pattern, (_, start, tag, end) => start + contents + end);
}
await writeFile(file, html);
