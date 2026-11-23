const moduleCache = new Map();
const trailKey = "riemann2vec.reading-trail.v1";

let snapshot;
const files = new Map();
export function useStaticReader(graph) { snapshot = graph; }
function staticFile(id, suffix = "") {
  if (!Object.hasOwn(snapshot.paths, id)) return Promise.reject(new Error("Outside the static reader snapshot"));
  const key = id + suffix;
  if (!files.has(key)) files.set(key, readJson("data/reader/" + key + ".json").catch(error => {
    files.delete(key);
    throw error;
  }));
  return files.get(key);
}

export async function readerRequest(path) {
  if (!snapshot) return readJson(path);
  const url = new URL(path, document.baseURI);
  const name = url.searchParams.get("name");
  const [resource, id] = path.split("?")[0].split("/").slice(1);
  if (resource === "lean") return staticFile(id);
  if (resource === "kernel") return (await staticFile(id, "-kernel"))[name];
  if (resource === "uses") {
    const index = snapshot.nodes[name]?.[0];
    const matches = index === undefined ? [] : (await staticFile(index, "-uses"))[name] ?? [];
    return {modules: snapshot.modules, matches};
  }
  if (resource === "declarations") {
    const query = url.searchParams.get("q").toLowerCase();
    const rank = name => {
      const full = name.toLowerCase(), leaf = full.split(".").at(-1);
      return full === query || leaf === query ? 0 : leaf.startsWith(query) ? 1 : 2;
    };
    return Object.entries(snapshot.nodes).filter(([n]) => n.toLowerCase().includes(query))
      .sort(([a], [b]) => rank(a) - rank(b) || a.length - b.length).slice(0, 28)
      .map(([n, [module, line]]) => [module, line, n]);
  }
  throw new Error("Outside the static reader snapshot");
}

async function readJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error("Lean reader data unavailable");
  return response.json();
}

export function leanMetadata(id) {
  if (!moduleCache.has(id)) {
    const request = readerRequest(`api/lean/${id}`).catch(error => {
      moduleCache.delete(id);
      throw error;
    });
    moduleCache.set(id, request);
  }
  return moduleCache.get(id);
}

export function declarationAt(metadata, line, name) {
  if (!metadata) return null;
  if (Object.hasOwn(metadata.decls, name)) return [name, metadata.decls[name]];
  const zero = line - 1;
  if (zero < 0) return null;
  return Object.entries(metadata.decls).filter(([, range]) => range[0] <= zero && range[2] >= zero)
    .sort(([, a], [, b]) => (a[2] - a[0]) - (b[2] - b[0]) || a[4] - b[4] || a[5] - b[5])[0] ?? null;
}

export function declarationLine(metadata, name) {
  const range = metadata.decls[name];
  return range ? range[4] + 1 : 0;
}

function signatureParts(lines, range) {
  const local = lines.slice(range[0], range[2] + 1);
  local[local.length - 1] = local.at(-1).slice(0, range[3]);
  local[0] = local[0].slice(range[1]);
  let depth = 0;
  let string = false;
  let block = 0;
  for (const [i, line] of local.entries()) {
    for (let c = 0; c < line.length; c++) {
      const pair = line.slice(c, c + 2);
      if (pair === "/-" && !string) { block++; c++; continue; }
      if (pair === "-/" && block) { block--; c++; continue; }
      if (block) continue;
      if (line[c] === '"' && line[c - 1] !== "\\") string = !string;
      if (string) continue;
      if (pair === "--") break;
      if ("([{⟨".includes(line[c])) depth++;
      if (")]}⟩".includes(line[c])) depth--;
      if (depth === 0 && pair === ":=") {
        return {text: [...local.slice(0, i), line.slice(0, c)].join("\n").trim(),
          end: [range[0] + i, c + (i === 0 ? range[1] : 0)]};
      }
    }
  }
  return {text: local.slice(0, 20).join("\n").trim(), end: null};
}

export function declarationDetails(metadata, decl, source) {
  const [name, range] = decl;
  const signature = signatureParts(source.split("\n"), range);
  const result = new Map();
  for (const [line, column, , , parent, module, target] of metadata.refs) {
    if (parent !== name || (module === metadata.module && target === name)) continue;
    const key = JSON.stringify([module, target]);
    const inBody = signature.end && (line > signature.end[0] ||
      (line === signature.end[0] && column > signature.end[1]));
    const previous = result.get(key);
    if (!previous || (inBody && !previous.inBody) || (inBody === previous.inBody && line < previous.line - 1)) {
      result.set(key, {module, target, line: line + 1, column, inBody});
    }
  }
  return {signature: signature.text, scoped: signature.end !== null,
    refs: Array.from(result.values()).sort((a, b) => a.line - b.line || a.column - b.column)};
}

export function codeView(source, options) {
  const {line, metadata, range, onReference} = options;
  const lines = source.replace(/\n$/, "").split("\n");
  const byLine = new Map();
  for (const item of metadata?.refs ?? []) {
    const [start, , end] = item;
    if (start !== end) continue;
    if (!byLine.has(start)) byLine.set(start, []);
    byLine.get(start).push(item);
  }
  const pre = document.createElement("pre");
  pre.className = "code lean-code";
  pre.tabIndex = 0;
  pre.setAttribute("aria-label", "Lean source");
  const start = range?.[0] ?? 0;
  const end = range ? Math.min(range[2] + 1, lines.length) : lines.length;
  const width = String(lines.length).length;
  let highlight;

  for (let i = start; i < end; i++) {
    const row = document.createElement("span");
    row.className = "lean-line";
    const number = document.createElement("span");
    number.className = "lean-line-number";
    number.textContent = String(i + 1).padStart(width);
    number.setAttribute("aria-hidden", "true");
    const text = document.createElement(i + 1 === line ? "mark" : "span");
    if (i + 1 === line) highlight = text;
    const refs = (byLine.get(i) ?? []).sort((a, b) => a[1] - b[1] || b[3] - a[3]);
    const content = lines[i];
    let column = 0;
    for (const [, from, , to, , module, name] of refs) {
      if (from < column || to <= from || to > content.length) continue;
      const token = content.slice(from, to);
      if (!/[\p{L}_]/u.test(token)) continue;
      text.append(content.slice(column, from));
      const reference = document.createElement("button");
      reference.type = "button";
      reference.className = "lean-reference";
      reference.textContent = token;
      reference.title = name;
      reference.setAttribute("aria-label", `Go to ${name}`);
      reference.addEventListener("click", () => onReference({module, target: name, line: i + 1}));
      text.append(reference);
      column = to;
    }
    text.append(content.slice(column) || (column === 0 ? " " : ""));
    row.append(number, text);
    pre.append(row);
  }
  return {pre, highlight};
}

export class ReadingTrail {
  constructor() {
    try {
      this.entries = JSON.parse(sessionStorage.getItem(trailKey)) ?? [];
      if (!Array.isArray(this.entries)) this.entries = [];
    } catch {
      this.entries = [];
    }
  }

  save() {
    try { sessionStorage.setItem(trailKey, JSON.stringify(this.entries)); } catch {}
  }

  push(entry) {
    if (this.entries.at(-1)?.hash !== entry.hash) this.entries.push(entry);
    this.entries = this.entries.slice(-24);
    this.save();
  }

  returnTo(index) {
    const [entry] = this.entries.splice(index);
    this.save();
    return entry;
  }
}
