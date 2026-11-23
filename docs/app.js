import {element, moduleHash, guideHash, guideLink} from "./ui.js";
import {packedIndex} from "./assets.js";
import { ReadingTrail, codeView, declarationAt, declarationDetails, declarationLine,
  leanMetadata, readerRequest, useStaticReader } from "./reader.js";

const $ = id => document.getElementById(id);
const number = new Intl.NumberFormat("en-US");
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const input = $("search");
const list = $("search-results");
const details = $("details");
const mainPath = "src/Main.lean";
const criticalPath = "src/Formalism/GammaFactorNonvanishing/CritLine.lean";
const conclusionPath = "src/Development/AutomorphicArithmetic/CharacterBoxes/MainConclusion.lean";
const featuredModules = new Map([
  [mainPath, "The final RH and GRH theorems"],
  ["src/Statements.lean", "Statements about zeta zeros and Dirichlet L-functions"],
  ["src/Supplements/Kernels/MainTheoremsAll.lean", "The proof entry point’s direct import"],
  ["src/Supplements/Kernels/MainTheorems.lean", "Assembly of the final theorems"],
  [criticalPath, "From right-half-plane nonvanishing to the critical line"],
  [conclusionPath, "Nonvanishing for every Dirichlet character"],
]);
const state = { mode: "guide", chapter: "statement", tab: "near", hits: [], highlight: -1, request: 0 };
const caches = { modules: new Map(), terms: new Map(), source: new Map(), neighbors: new Map(), "term-info": new Map() };
const mathlibRevision = "0df444a360eaa60ab8c11dca51a86af692955474";
const trail = new ReadingTrail();
let map, regionCard, globalOverview, chapters;

function link(text, href) {
  const anchor = element("a", "", text);
  anchor.href = href;
  anchor.target = "_blank";
  anchor.rel = "noreferrer";
  return anchor;
}

async function fetchAsset(url, kind = "json", signal) {
  const result = await fetch(url, {signal});
  if (!result.ok) throw new Error(`HTTP ${result.status} for ${url}`);
  return result[kind]();
}

function byChunk(name, id, size) {
  const group = Math.floor(id / size);
  const cache = caches[name];
  if (!cache.has(group)) {
    const pending = fetchAsset(`data/${name}/${group}.json`).catch(error => {
      cache.delete(group);
      throw error;
    });
    cache.set(group, pending);
  }
  return cache.get(group).then(chunk => chunk[id % size]);
}

function sourceUrl(id, line) {
  const path = state.paths[id].split("/").map(encodeURIComponent).join("/");
  return `${state.meta.repository}/blob/${state.meta.revision}/${path}${line ? "#L" + line : ""}`;
}

async function fetchLean(id) {
  if (!state.live && Object.hasOwn(state.graph.paths, id)) return (await leanMetadata(id)).source;
  const path = (state.paths?.[id] ?? state.graph.paths[id]).split("/").map(encodeURIComponent).join("/");
  const signal = AbortSignal.timeout(10000);
  if (state.live) {
    const local = await fetch(`lean-source/${path.replace(/^src\//, "")}`, {signal});
    if (local.ok) return local.text();
  }
  const project = new URL(state.meta.repository).pathname;
  return fetchAsset(`https://raw.githubusercontent.com${project}/${state.meta.revision}/${path}`, "text", signal);
}

function cachedSource(id) {
  if (!caches.source.has(id)) {
    const pending = fetchLean(id).catch(error => { caches.source.delete(id); throw error; });
    caches.source.set(id, pending);
  }
  return caches.source.get(id);
}

function pathName(id) { return state.paths[id].replace(/^src\//, ""); }

function row(label, value, action, color) {
  const button = element("button", "result-row");
  if (color) {
    const dot = element("span", "term-dot");
    dot.style.setProperty("--dot", color);
    button.append(dot);
  }
  button.append(element("span", "label", label));
  if (value) button.append(element("span", "value", value));
  button.addEventListener("click", action);
  return button;
}

function note(text) { return element("p", "detail-note", text); }

function displayLeanName(node, name) {
  node.replaceChildren();
  const parts = name.split(".");
  parts.forEach((part, index) => {
    if (index) node.append(".", element("wbr"));
    node.append(part);
  });
}

async function computeNeighbors(id) {
  const shard = Math.floor(id / 256);
  if (!caches.neighbors.has(shard)) {
    const pending = fetchAsset(`data/neighbors/${shard}.bin`, "arrayBuffer")
      .then(buffer => new DataView(buffer)).catch(error => { caches.neighbors.delete(shard); throw error; });
    caches.neighbors.set(shard, pending);
  }
  const view = await caches.neighbors.get(shard);
  const start = (id % 256) * 8 * 12;
  return Array.from({length: 8}, (_, i) => {
    const offset = start + i * 12;
    return {id: view.getUint32(offset, true), score: view.getFloat64(offset + 4, true)};
  });
}

function setLocation(hash) {
  if (location.hash !== hash) history.pushState(null, "", hash);
}

function setMode(mode) {
  const terms = mode === "term";
  const guide = mode === "guide";
  if (state.mode !== mode) { input.value = ""; ++state.request; }
  state.mode = mode;
  input.placeholder = terms ? "Search Lean identifiers…" : "Find a Lean name…";
  input.setAttribute("aria-label", terms ? "Search Lean identifiers" : "Search Lean source");
  $("lean-search-kind").hidden = mode !== "module";
  $("guide-view").setAttribute("aria-pressed", guide);
  $("map-view").setAttribute("aria-pressed", terms);
  $("module-view").setAttribute("aria-pressed", mode === "module");
  $("proof-guide").hidden = !guide;
  $("proof-paths").hidden = mode !== "proof";
  $("paths-view").setAttribute("aria-pressed", mode === "proof");
  $("explorer-body").hidden = guide || mode === "proof";
  input.closest(".search").hidden = guide || mode === "proof";
  $("map-section").hidden = !terms;
  $("modules-section").hidden = mode !== "module";
  $("detail-tabs").hidden = !terms;
  $("reader-tabs").hidden = mode !== "module";
  clearSearch();
}

function mathlibHash(module, name) {
  return "#" + new URLSearchParams({mathlib: module, decl: name}).toString();
}

async function showGuide(id, focus = false) {
  setMode("guide");
  const request = ++state.request;
  const {renderGuide} = await import("./guide-view.js");
  if (request === state.request) state.chapter = renderGuide(id, focus);
}

function clusterButton(label, id, className) {
  const button = element("button", className, label);
  button.addEventListener("click", () => showRegion(id));
  return button;
}

function mapBreadcrumb(region, full) {
  const path = $("embedding-path");
  path.replaceChildren(clusterButton("All regions", "all", "crumb"));
  if (full) {
    path.append(element("span", "crumb-current", "Full projection"));
    return;
  }
  if (region?.parent) path.append(clusterButton(region.parent.title, region.parent.id, "crumb"));
  if (region) {
    const current = element("span", "crumb-current", region.title);
    current.tabIndex = -1;
    current.setAttribute("aria-current", "page");
    path.append(current);
  }
  if (!region) path.firstChild.setAttribute("aria-current", "page");
}

function configurePlot(region, full = false) {
  const scope = full ? "full" : region?.points ? region.id : "";
  const onPlot = Boolean(scope);
  $("plot-stage").hidden = !onPlot;
  $("projection-caption").hidden = !onPlot;
  $("projection-caption").textContent = onPlot ? (full
    ? "Colors group identifiers by their usage in Lean. Regions can overlap in this two-dimensional view."
    : region.note) : "";
  $("region-explorer").hidden = onPlot;
  $("projection-toggle").textContent = full ? "Subcluster PCA" : "Full PCA";
  $("region-legend").hidden = !full;
  $("region-legend").open = false;
  if (scope !== state.plotScope && onPlot) {
    const points = full ? state.globalPoints : region.points;
    const landmarks = full ? state.globalLandmarks : region.examples;
    map.setSelection(undefined, [], false);
    map.setData(state.words, points, id => state.regions.color(id), landmarks);
    map.reset();
  }
  state.plotScope = scope;
  if (!onPlot) return;
  $("map-label").textContent = full ? "FULL PCA" : "SUBCLUSTER PCA";
  $("map-count").textContent = `· ${number.format(map.points.length)} points`;
}

function showRegion(id = "all", updateHistory = true) {
  if (!state.regions) return;
  const region = state.regions.byId.get(id);
  if (region?.parent && !state.atlasReady) {
    setLocation("#cluster=" + region.id);
    return restore(true);
  }
  ++state.request;
  state.fullProjection = false;
  setMode("term");
  input.value = "";
  if (updateHistory) setLocation(`#cluster=${region?.id ?? "all"}`);
  mapBreadcrumb(region);
  configurePlot(region);
  const panel = $("region-explorer");
  panel.scrollTop = 0;
  panel.replaceChildren();
  if (!region?.points) {
    const heading = element("h2", "", region?.title ?? "Embedding regions");
    heading.tabIndex = -1;
    const instructions = element("p", "", region ? region.note : "Each region groups identifiers used in similar Lean contexts. Open one to explore its subclusters.");
    const grid = element("div", "region-grid");
    for (const item of region?.children ?? state.regions.parents) {
      grid.append(regionCard(item, state.words, showRegion));
    }
    panel.append(heading, instructions, grid);
    if (updateHistory) heading.focus({preventScroll: true});
  } else {
    map.setSelection(undefined, [], false);
    $("map-status").textContent = "Click an identifier";
    if (updateHistory) $("embedding-path").lastChild.focus({preventScroll: true});
  }
  $("detail-tabs").hidden = true;
  $("selection-type").textContent = region?.points ? "EMBEDDING SUBCLUSTER" : "EMBEDDING REGIONS";
  $("selection").textContent = region?.title ?? "All regions";
  $("selection").classList.add("region-title");
  $("selection-meta").textContent = region
    ? `${number.format(region.count)} terms · ${region.children ? region.children.length + " subclusters" : number.format(region.points.length) + " plotted"}`
    : `${number.format(state.meta.terms)} terms · ${state.regions.parents.length} regions`;
  $("selection-region").replaceChildren();
  details.scrollTop = 0;
  if (region) {
    details.replaceChildren(element("h3", "mini-heading", "Representative identifiers"));
    for (const term of region.examples) addRegionTerm(term);
  } else {
    details.replaceChildren(
      note("Regions group identifiers with similar Lean usage. Each subcluster has its own projection."),
      element("h3", "mini-heading", "Proof landmarks"),
    );
    for (const term of state.globalLandmarks.slice(0, 3)) addRegionTerm(term);
  }
  if (!region?.points) {
    details.append(globalOverview(state.globalPoints, state.regions, region, () => {
      state.fullProjection = true;
      const example = region?.examples.find(id => state.globalPointIds.has(id));
      selectTerm(example ?? state.firstTerm);
    }));
  }
  if (region?.points) {
    const more = element("button", "region-more", "Browse most frequent terms");
    more.addEventListener("click", () => {
      const [parentIndex, childIndex] = region.id.split(".").map(Number);
      const members = state.firstMembers[parentIndex * 3 + childIndex];
      details.replaceChildren(note("The 30 most frequent identifiers in this subcluster."));
      for (const term of members) addRegionTerm(term);
      details.querySelector(".result-row")?.focus({preventScroll: true});
    });
    details.append(more);
  }
}

function addRegionTerm(id) {
  const word = state.words[id];
  details.append(row(word, "", () => selectTerm(id), state.regions.color(id)));
}

async function selectTerm(id, tab = "near", updateHistory = true) {
  if (!state.words || state.words[id] === undefined) return;
  const word = state.words[id];
  const guide = chapters.find(item => item.id === state.chapter && item.term === word);
  if (updateHistory) setLocation(`#term=${encodeURIComponent(word)}${tab === "source" ? "&view=source" : ""}${state.fullProjection ? "&projection=full" : ""}${guide ? "&chapter=" + guide.id : ""}`);
  if (!state.atlasReady || !state.proofGraph) return restore();
  setMode("term");
  state.term = id;
  state.tab = tab;
  const region = state.regions.forTerm(id);
  mapBreadcrumb(region, state.fullProjection);
  configurePlot(region, state.fullProjection);
  $("selection").classList.remove("region-title");
  $("selection-region").replaceChildren(clusterButton(region.title, region.id, "region-link"));
  input.value = "";
  const request = ++state.request;
  $("selection-type").textContent = "SELECTED IDENTIFIER";
  $("selection").textContent = word;
  const frequency = state.counts[id];
  $("selection-meta").textContent = `${number.format(frequency)} training ${frequency === 1 ? "occurrence" : "occurrences"}`;
  $("map-status").textContent = map.position.has(id) ? "Drag to pan" : "This term is outside the plotted subset";
  map.setSelection(id, [], true);
  const focusedIndex = Array.from(details.children).indexOf(document.activeElement);
  if (tab === "source") {
    renderTerm(id, []);
    return;
  }
  details.replaceChildren(note("Finding nearest identifiers…"));
  try {
    const neighbors = await computeNeighbors(id);
    await Promise.all(neighbors.map(async ({id: other}) => {
      if (state.words[other] !== undefined) return;
      const [name, count] = await byChunk("term-info", other, 256);
      state.words[other] = name;
      state.counts[other] = count;
      state.wordIds.set(name, other);
    }));
    if (request !== state.request || state.mode !== "term") return;
    map.setSelection(id, neighbors, false);
    renderTerm(id, neighbors);
  } catch {
    if (request === state.request) details.replaceChildren(note("Could not load similarity data. Select Nearest terms to retry."));
  }
  if (focusedIndex >= 0) details.children[focusedIndex]?.focus({preventScroll: true});
}

async function renderTerm(id, neighbors) {
  const request = ++state.request;
  const nearest = state.tab === "near";
  $("near-tab").setAttribute("aria-pressed", nearest);
  $("source-tab").setAttribute("aria-pressed", !nearest);
  details.scrollTop = 0;
  const word = state.words[id];
  const guide = chapters.find(item => item.id === state.chapter && item.term === word) ??
    chapters.find(item => item.term === word);
  const proofContext = [];
  if (guide) {
    const [path, line, name, purpose] = guide.embeddingSource ?? guide.references[0];
    const box = element("div", "proof-context");
    const anchor = element("a", "proof-context-link", name);
    anchor.href = moduleHash(path, line, "", guide.id);
    box.append(element("h3", "", "In the guided proof"), anchor,
      element("p", "", purpose));
    proofContext.push(box);
  }
  const matchingNames = state.proofGraph.names.filter(name => name === word || name.endsWith("." + word));
  for (const name of matchingNames) proofContext.push(state.proofGraph.reference(name));
  if (nearest) {
    details.replaceChildren(...proofContext, note(`Cosine similarity · 64 dimensions · ${map.neighbors.length} of ${neighbors.length} neighbors plotted`));
    if (state.counts[id] < 10) details.append(note("This rare identifier has few training contexts."));
    for (const {id: other, score} of neighbors) {
      const word = state.words[other];
      const button = row(word, score.toFixed(3), () => selectTerm(other), state.regions.color(other));
      const status = $("map-status").textContent;
      const preview = active => {
        map.preview = active ? other : undefined;
        const point = map.position.get(other);
        $("map-status").textContent = active
          ? (point ? word : word + " · outside plotted subset") : status;
        map.draw();
      };
      button.onfocus = button.onpointerenter = () => preview(true);
      button.onblur = button.onpointerleave = () => preview(false);
      details.append(button);
    }
    return;
  }
  const searchButton = element("button", "region-more", `Find Lean declarations for ${word}`);
  searchButton.addEventListener("click", async () => {
    try { await loadReaderIndex(); } catch {
      if (request === state.request) searchButton.textContent = "Retry declaration search";
      return;
    }
    if (request !== state.request) return;
    selectModule(state.module ?? state.featured[0]);
    $("lean-search-kind").value = "declaration";
    input.value = word;
    input.focus();
    search();
  });
  proofContext.push(searchButton);
  details.replaceChildren(...proofContext, note("Loading references…"));
  try {
    const [references] = await Promise.all([byChunk("terms", id, state.meta.termBatch), loadModules()]);
    if (request !== state.request) return;
    if (!references.length) {
      details.replaceChildren(...proofContext, note("No lexical occurrences are indexed for this token."));
      return;
    }
    details.replaceChildren(...proofContext, note("Representative occurrences of this spelling across the release."));
    for (const [module, line, kind] of references) {
      const ref = element("div", "reference");
      const button = element("button", "", pathName(module));
      button.addEventListener("click", () => selectModule(module, line));
      ref.append(button, link(`L${line}`, sourceUrl(module, line)), element("p", "", kind === "declaration" ? "Declaration" : "Mention"));
      details.append(ref);
    }
  } catch (error) {
    if (request === state.request) details.replaceChildren(...proofContext, note("The lexical occurrences could not be loaded."));
  }
}

function toggleModuleView(reading) {
  state.reading = reading;
  $("module-list").hidden = reading;
  $("module-content").hidden = !reading;
  const path = state.external ? state.external.module.replaceAll(".", "/") + ".lean" : pathName(state.module);
  $("module-title").textContent = reading ? path.split("/").at(-1) : "Lean modules";
  $("module-description").textContent = reading ? path : "Search for a declaration or choose a module.";
  $("module-toggle").textContent = reading ? "Browse modules" : "Read selection";
  $("reader-toolbar").hidden = !reading;
  if (!reading) readerStatus("");
}

function renderModuleList(query) {
  const top = [...state.featured];
  if (state.module !== undefined && !top.includes(state.module)) top.unshift(state.module);
  const matches = query ? find(state.lowerPaths, query, 80) : top;
  $("module-list").replaceChildren();
  if (!matches.length) $("module-list").append(note("No modules match your search."));
  for (const id of matches) {
    const button = row(pathName(id), "", () => selectModule(id));
    const description = featuredModules.get(state.paths[id]);
    if (description && !query) button.querySelector(".label").append(element("span", "module-caption", description));
    if (id === state.module) button.setAttribute("aria-current", "true");
    $("module-list").append(button);
  }
}

function readerStatus(message) {
  const status = $("reader-status");
  status.textContent = message;
  status.hidden = !message;
}

function drawTrail() {
  const panel = $("reading-trail");
  panel.replaceChildren();
  const lastIndex = trail.entries.findLastIndex(entry => entry.hash !== location.hash);
  if (lastIndex < 0) return;
  const last = trail.entries[lastIndex];
  const makeButton = (entry, index, label) => {
    const button = element("button", "trail-button", label);
    button.addEventListener("click", () => {
      const destination = trail.returnTo(index);
      if (!destination?.hash.startsWith("#")) return;
      setLocation(destination.hash);
      restore(true);
    });
    return button;
  };
  panel.append(makeButton(last, lastIndex, `Back to ${last.label}`));
  if (trail.entries.length > 1) {
    const list = element("details", "trail-list");
    list.append(element("summary", "", "Reading trail"));
    const items = element("ol");
    for (const [index, entry] of trail.entries.entries()) {
      const item = element("li");
      item.append(makeButton(entry, index, entry.label));
      items.append(item);
    }
    list.append(items);
    panel.append(list);
  }
}

function readerStart(title, path, line) {
  setMode("module");
  input.value = "";
  ++state.request;
  state.readerTab = "module";
  $("selection-type").textContent = "LEAN MODULE";
  $("selection").classList.remove("region-title");
  $("selection-region").replaceChildren();
  $("selection").textContent = title;
  $("selection-meta").textContent = path;
  $("reader-scope").hidden = true;
  $("reader-scope").textContent = "Show full file";
  $("module-content").replaceChildren(note("Loading Lean source…"));
  $("module-content").scrollTop = 0;
  readerStatus("Loading declaration links…");
  details.replaceChildren(note("Loading source index…"));
  details.scrollTop = 0;
  state.reader = {line, full: false};
  return state.request;
}

async function selectModule(id, line = 0, updateHistory = true, name = "", tab = "declaration") {
  if (!state.localModules?.[id] && !state.fullDirectory) {
    const request = ++state.request;
    const origin = location.hash;
    try { await loadModules(); } catch {
      if (request === state.request) readerStatus("Could not load the module directory.");
      return;
    }
    if (request !== state.request || location.hash !== origin) return;
  }
  if (state.paths?.[id] === undefined) return;
  state.module = id;
  state.external = null;
  const path = pathName(id);
  const request = readerStart(path.split("/").at(-1), path, line);
  state.reader.id = id;
  if (updateHistory) setLocation(moduleHash(state.paths[id], line, name, state.chapter));
  drawTrail();
  toggleModuleView(true);
  renderModuleList("");
  const index = state.localModules?.[id] ?? byChunk("modules", id, state.meta.moduleBatch).catch(() => null);
  const semantic = leanMetadata(id).catch(() => null);
  try {
    const [source, moduleIndex] = await Promise.all([cachedSource(id), index]);
    if (request !== state.request) return;
    Object.assign(state.reader, {source, moduleIndex, id});
    drawCode();
    renderReaderTabs();
    const metadata = await semantic;
    if (request !== state.request) return;
    const current = state.reader;
    current.metadata = metadata;
    current.decl = declarationAt(metadata, line, name);
    if (current.decl && line === 0) current.line = current.decl[1][4] + 1;
    if (current.decl) {
      current.info = declarationDetails(metadata, current.decl, source);
      state.readerTab = tab === "kernel" && metadata.kernel ? "kernel" : "declaration";
    }
    readerStatus(metadata
      ? name && !current.decl ? "Lean identifies the target module. The declaration range is unavailable." : "Click an underlined name to follow the reference resolved by Lean."
      : "Source available. Lean reference metadata could not be loaded.");
    drawCode();
    renderReaderTabs();
  } catch {
    if (request !== state.request) return;
    readerStatus("This file could not be loaded.");
    $("module-content").replaceChildren(link("Open pinned Lean source", sourceUrl(id, line)));
    renderReaderTabs();
  }
}

function drawCode() {
  const reader = state.reader;
  if (!reader?.source) return;
  const {source, line, metadata, decl, full} = reader;
  const {pre, highlight} = codeView(source, {line, metadata, range: full ? null : decl?.[1], onReference: followReference});
  $("module-content").replaceChildren(pre);
  $("reader-scope").hidden = !decl;
  $("reader-scope").textContent = full ? "Focus declaration" : "Show full file";
  if (highlight && state.reading) {
    const panel = $("module-content");
    panel.scrollTop = 0;
    panel.scrollTop = Math.max(0, highlight.getBoundingClientRect().top - panel.getBoundingClientRect().top - 55);
  }
}

function guideReturn(id) {
  const current = chapters.find(item => item.id === state.chapter && item.references.some(([p]) => p === state.paths[id]));
  const guide = current ?? chapters.find(item => item.references.some(([p]) => p === state.paths[id]));
  if (!guide) return null;
  const back = guideLink(guide.id, "Return to guide chapter");
  back.className = "source-link";
  return back;
}

function referenceRows(title, refs) {
  const section = element("section", "reference-group");
  section.append(element("h3", "mini-heading", title));
  if (!refs.length) section.append(note("No named source references in this section."));
  for (const ref of refs) section.append(row(ref.target, `L${ref.line}`, () => followReference(ref)));
  return section;
}

function renderModuleDetails(reader) {
  const {id, line, moduleIndex} = reader;
  if (id === undefined) {
    if (state.external) details.replaceChildren(link("Open pinned Mathlib module", mathlibLink(state.external.module, line)));
    return;
  }
  details.replaceChildren();
  if (moduleIndex) {
    const [lines, imports, declarations] = moduleIndex;
    const actual = reader.metadata ? Object.entries(reader.metadata.decls)
      .map(([name, range]) => [name, range[4] + 1]).sort((a, b) => a[1] - b[1]) : declarations;
    details.append(note(`${number.format(lines)} lines · ${imports.length} direct imports`));
    if (actual.length) {
      details.append(element("h3", "mini-heading", "Declarations"));
      for (const [name, location] of actual) {
        details.append(row(name, `L${location}`, () => selectModule(id, location, true, name)));
      }
    }
    if (imports.length) {
      details.append(element("h3", "mini-heading", "Direct imports"));
      for (const target of imports) {
        if (typeof target === "number") details.append(row(pathName(target), "", () => selectModule(target)));
        else if (target === "Mathlib" || target.startsWith("Mathlib.")) {
          details.append(row(target, "", () => selectMathlib(target, "")));
        } else details.append(note(target));
      }
    }
  } else details.append(note("The module index is unavailable."));
  const source = link("Open pinned source", sourceUrl(id, line));
  source.className = "source-link";
  details.prepend(source);
  const back = guideReturn(id);
  if (back) details.prepend(back);
}

async function renderReaderTabs() {
  if (state.mode !== "module") return;
  const reader = state.reader;
  if (!reader) return;
  const {decl, info, metadata, id, line} = reader;
  const mode = decl ? state.readerTab : "module";
  $("declaration-tab").hidden = !decl;
  $("uses-tab").hidden = !decl;
  $("kernel-tab").hidden = !decl || !metadata?.kernel;
  for (const key of ["declaration", "kernel", "uses", "module"]) $(key + "-tab").setAttribute("aria-pressed", key === mode);
  details.scrollTop = 0;
  if (decl) {
    $("selection-type").textContent = "LEAN DECLARATION";
    displayLeanName($("selection"), decl[0]);
    $("selection-meta").textContent = `${pathName(id).split("/").at(-1)} · line ${decl[1][4] + 1}`;
  }
  if (mode === "module") {
    renderModuleDetails(reader);
  } else if (mode === "declaration") {
    const split = info.scoped ? info.refs.filter(ref => ref.inBody) : info.refs;
    const typeRefs = info.scoped ? info.refs.filter(ref => !ref.inBody) : [];
    const signature = element("pre", "code lean-signature", info.signature);
    signature.tabIndex = 0;
    details.replaceChildren(signature);
    if (state.proofGraph.names.includes(decl[0])) details.append(state.proofGraph.reference(decl[0]));
    const back = guideReturn(id);
    if (back) details.append(back);
    details.append(referenceRows(info.scoped ? "Proof references" : "Declaration references", split));
    if (typeRefs.length) {
      const types = element("details", "type-references");
      types.append(element("summary", "", `Type references (${typeRefs.length})`), referenceRows("References in the statement", typeRefs));
      details.append(types);
    }
  } else if (mode === "kernel") {
    renderKernel(reader);
  } else {
    details.replaceChildren(note("Loading resolved uses…"));
    const query = new URLSearchParams({module: metadata.module, name: decl[0]});
    try {
      const {modules, matches} = await readerRequest("api/uses?" + query);
      if (matches.some(([id, , name]) => !name && !state.paths[id])) await loadModules();
      if (reader !== state.reader || state.readerTab !== "uses" || state.mode !== "module") return;
      details.replaceChildren(note(`Uses recorded in ${number.format(modules)} locally indexed modules.`));
      if (!matches.length) details.append(note("No uses in the currently indexed modules."));
      for (const [file, occurrence, enclosing] of matches) {
        details.append(row(enclosing || pathName(file), `L${occurrence}`, () => {
          rememberPosition(line);
          selectModule(file, occurrence, true, enclosing);
        }));
      }
    } catch {
      if (reader === state.reader && state.readerTab === "uses" && state.mode === "module") details.replaceChildren(note("The reverse reference index is unavailable."));
    }
  }
}

async function renderKernel(reader) {
  const name = reader.decl[0];
  details.replaceChildren(note("Reading the compiled declaration…"));
  const query = new URLSearchParams({name});
  try {
    const {type, value} = await readerRequest(`api/kernel/${reader.id}?${query}`);
    if (reader !== state.reader || state.readerTab !== "kernel" || state.mode !== "module") return;
    const sourceRefs = new Map();
    for (const ref of reader.info.refs) {
      const match = sourceRefs.get(ref.target);
      if (!match || ref.inBody) sourceRefs.set(ref.target, ref);
    }
    const openConstant = async target => {
      const explicit = sourceRefs.get(target);
      if (explicit) { followReference(explicit); return; }
      const rows = await readerRequest("api/declarations?" + new URLSearchParams({q: target})).catch(() => []);
      if (reader !== state.reader || state.mode !== "module") return;
      const exact = rows.filter(([, , found]) => found === target);
      if (exact.length === 1) {
        const [[id, line]] = exact;
        const targetMeta = await leanMetadata(id).catch(() => null);
        if (reader !== state.reader || state.mode !== "module") return;
        if (targetMeta && Object.hasOwn(targetMeta.decls, target)) {
          rememberPosition(reader.line);
          selectModule(id, line, true, target);
          return;
        }
      }
      $("lean-search-kind").value = "declaration";
      input.value = target;
      input.focus();
      readerStatus("Select a declaration from the search results to open its source.");
    };
    details.replaceChildren(note("Direct constants in the compiled expressions."));
    const append = (label, values, open) => {
      const group = element("details", "type-references");
      group.open = open;
      group.append(element("summary", "", `${label} (${values.length})`));
      for (const target of values) {
        group.append(row(target, "", () => openConstant(target)));
      }
      details.append(group);
    };
    if (value) append("Proof term or definition body", value, true);
    else details.append(note("This declaration has no compiled value."));
    append("Type", type, false);
  } catch {
    if (reader === state.reader && state.readerTab === "kernel" && state.mode === "module") {
      details.replaceChildren(note("This declaration’s compiled references could not be read."));
    }
  }
}

function rememberPosition(line) {
  const reader = state.reader;
  if (!reader || reader.id === undefined) return;
  const at = line || reader.line;
  const hash = moduleHash(state.paths[reader.id], at, reader.decl?.[0], state.chapter);
  const label = `${pathName(reader.id).split("/").at(-1)}${at ? ":" + at : ""}`;
  trail.push({hash, label});
  history.replaceState(null, "", hash);
}

async function followReference({module, target, line}) {
  const path = "src/" + module.replaceAll(".", "/") + ".lean";
  const request = state.request;
  if (!module.startsWith("Mathlib.") && !state.pathIds.has(path) && !state.fullDirectory) {
    try { await loadModules(); } catch { readerStatus("Could not load the module directory."); return; }
    if (request !== state.request || state.mode !== "module") return;
  }
  const id = state.pathIds.get(path);
  if (id === undefined) {
    if (module.startsWith("Mathlib.")) {
      rememberPosition(line);
      selectMathlib(module, target);
      $("module-title").focus({preventScroll: true});
    } else {
      readerStatus(`${target} is defined in ${module}, outside the local proof and Mathlib sources.`);
    }
    return;
  }
  readerStatus(`Opening ${target}…`);
  const metadata = await leanMetadata(id).catch(() => null);
  if (request !== state.request || state.mode !== "module") return;
  const location = metadata ? declarationLine(metadata, target) : 0;
  rememberPosition(line);
  selectModule(id, location, true, target);
  $("module-title").focus({preventScroll: true});
}

function mathlibLink(module, line) {
  return `https://github.com/leanprover-community/mathlib4/blob/${mathlibRevision}/${module.replaceAll(".", "/")}.lean${line ? "#L" + line : ""}`;
}

async function selectMathlib(module, name, updateHistory = true) {
  if (!/^Mathlib(?:[.][\p{L}\p{N}_'′]+)*$/u.test(module)) return;
  state.external = {module, name};
  const path = module.replaceAll(".", "/") + ".lean";
  const request = readerStart(path.split("/").at(-1), path, 0);
  if (updateHistory) setLocation(mathlibHash(module, name));
  drawTrail();
  toggleModuleView(true);
  try {
    const query = new URLSearchParams({module, name});
    const result = await readerRequest("api/mathlib?" + query);
    if (request !== state.request) return;
    Object.assign(state.reader, {source: result.source, line: result.line});
    $("selection-type").textContent = "MATHLIB DECLARATION";
    displayLeanName($("selection"), name || path.split("/").at(-1));
    readerStatus(result.line ? "Module resolved by Lean · source line matched in pinned Mathlib" : "Pinned Mathlib module · declaration range unavailable");
    drawCode();
    renderReaderTabs();
  } catch {
    if (request !== state.request) return;
    readerStatus("The local Mathlib checkout is unavailable.");
    $("module-content").replaceChildren(link("Open pinned Mathlib module", mathlibLink(module)));
    renderReaderTabs();
  }
}

function find(values, query, limit) {
  const prefix = [];
  const inside = [];
  const exact = [];
  let index = 0;
  for (const value of values) {
    if (value === query && exact.length < limit) exact.push(index);
    else if ((value.startsWith(query) || value.startsWith(query, value.lastIndexOf("/") + 1)) && prefix.length < limit) prefix.push(index);
    else if (value.includes(query) && inside.length < limit) inside.push(index);
    index++;
  }
  return exact.concat(prefix, inside).slice(0, limit);
}

function clearSearch() {
  state.searchToken = (state.searchToken ?? 0) + 1;
  state.hits = [];
  state.highlight = -1;
  list.hidden = true;
  state.searchPending = null;
  input.setAttribute("aria-expanded", "false");
  input.removeAttribute("aria-activedescendant");
}

function chooseSearch(index) {
  const hit = state.hits[index];
  if (!hit) return;
  input.value = "";
  if (hit.type === "term") selectTerm(hit.id);
  else selectModule(hit.id, hit.line, true, hit.name);
}

function showSearch(hits, message = "No matches") {
  state.hits = hits;
  list.replaceChildren();
  for (const [index, hit] of hits.entries()) {
    const label = hit.type === "term" ? state.words[hit.id] : hit.name ?? pathName(hit.id);
    const option = element("li", "search-option");
    option.append(element("span", "", label));
    if (hit.type === "declaration") {
      option.append(element("small", "", `${pathName(hit.id).split("/").at(-1)} · L${hit.line}`));
    } else if (hit.type === "module") option.append(element("small", "", "Module"));
    option.id = `option-${index}`;
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", "false");
    option.addEventListener("pointerdown", event => event.preventDefault());
    option.addEventListener("click", () => chooseSearch(index));
    list.append(option);
  }
  if (!hits.length) {
    const empty = element("li", "empty", message);
    empty.setAttribute("role", "option");
    empty.setAttribute("aria-disabled", "true");
    list.append(empty);
  }
  input.setAttribute("aria-expanded", "true");
  list.hidden = false;
}

function search() {
  if (input.disabled || !["term", "module"].includes(state.mode)) return;
  const literal = input.value.trim();
  const query = literal.toLowerCase();
  clearSearch();
  if (!query) {
    if (state.mode === "module" && !state.reading) renderModuleList("");
    return;
  }
  const token = state.searchToken;
  showSearch([], "Searching…");
  state.searchPending = searchIndex(query, literal, token).catch(() => {
    if (token === state.searchToken) showSearch([], "Search index unavailable. Type again to retry.");
  }).finally(() => {
    if (token === state.searchToken) state.searchPending = null;
  });
}

async function searchIndex(query, literal, token) {
  if (state.mode === "term") {
    if (!state.lowerWords) await loadWords();
    if (token !== state.searchToken) return;
    const exact = state.wordIds.get(literal);
    let matches = find(state.lowerWords, query, 10);
    if (exact !== undefined) matches = [exact, ...matches.filter(id => id !== exact)].slice(0, 10);
    showSearch(matches.map(id => ({type: "term", id})));
    return;
  }
  const scope = $("lean-search-kind").value;
  if (scope !== "declaration" || !state.reading) {
    await loadModules();
    if (token !== state.searchToken) return;
    state.lowerPaths ??= state.paths.map(path => path.replace(/^src\//, "").toLowerCase());
  }
  const files = scope === "declaration" ? [] : find(state.lowerPaths, query, 8).map(id => ({type: "module", id}));
  if (!state.reading) renderModuleList(query);
  if (scope === "module") { showSearch(files); return; }
  showSearch([], "Searching Lean declarations…");
  await readerRequest("api/declarations?" + new URLSearchParams({q: literal}))
    .then(async rows => {
      if (token !== state.searchToken) return;
      if (rows.some(([id]) => !state.paths[id])) await loadModules();
      if (token !== state.searchToken) return;
      let decls = rows.map(([id, line, name]) => ({type: "declaration", id, line, name}));
      const chapter = chapters.find(item => item.id === state.chapter);
      const proofPaths = new Set(chapter?.references.map(([path]) => path));
      decls.sort((a, b) => Number(proofPaths.has(state.paths[b.id])) - Number(proofPaths.has(state.paths[a.id])));
      const exactFile = files.find(({id}) => pathName(id).split("/").at(-1).replace(/\.lean$/, "").toLowerCase() === query);
      const hits = exactFile ? [exactFile, ...decls, ...files.filter(file => file !== exactFile)] : [...decls, ...files];
      showSearch(hits.slice(0, 18));
    }).catch(() => {
      if (token === state.searchToken) showSearch(files, "Declaration index unavailable");
    }).finally(() => {
      if (token === state.searchToken) state.searchPending = null;
    });
}

function searchKeys(event) {
  if (event.key === "Escape") { clearSearch(); return; }
  if (event.key === "Enter" && state.searchPending && !state.hits.length && !list.hidden) {
    event.preventDefault();
    const token = state.searchToken;
    state.searchPending.then(() => { if (token === state.searchToken) chooseSearch(0); });
    return;
  }
  if (!state.hits.length) return;
  if (event.key === "Enter") {
    event.preventDefault();
    chooseSearch(Math.max(state.highlight, 0));
    return;
  }
  if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
  event.preventDefault();
  const count = state.hits.length;
  const step = event.key === "ArrowDown" ? 1 : -1;
  state.highlight = state.highlight === -1 && step === -1 ? count - 1 : (state.highlight + step + count) % count;
  Array.from(list.children).forEach((item, index) => item.setAttribute("aria-selected", index === state.highlight));
  const active = list.children[state.highlight];
  active.scrollIntoView({block: "nearest"});
  input.setAttribute("aria-activedescendant", active.id);
}

export async function restore(focus = false, focusSearch = false) {
  if (focusSearch) state.focusSearch = true;
  const route = location.hash;
  const params = new URLSearchParams(location.hash.slice(1));
  if (!params.has("proof") && !params.has("module") && !params.has("mathlib") && !params.has("term") && !params.has("cluster")) {
    showGuide(params.get("guide"), focus);
    return;
  }
  const mode = params.has("proof") ? "proof" : params.has("module") || params.has("mathlib") ? "module" : "term";
  const overview = params.has("cluster") && !params.get("cluster").includes(".");
  const ready = mode === "proof" ? state.proofGraph : mode === "module" ? state.localModules && state.proofGraph
    : overview ? state.regions : state.atlasReady && (!params.has("term") || state.proofGraph);
  const path = params.get("module");
  const termName = params.get("term");
  const unknownPath = path && !state.fullDirectory && !state.pathIds?.has(path);
  const unknownTerm = termName && !state.lowerWords && !state.wordIds?.has(termName);
  if (!ready || unknownPath || unknownTerm) {
    setMode(mode);
    input.disabled = true;
    const panel = mode === "proof" ? $("path-trace") : mode === "module" ? $("module-content") : $("region-explorer");
    panel.replaceChildren(note("Loading " + (mode === "proof" ? "proof paths" : mode === "module" ? "the Lean index" : "the atlas") + "…"));
    try {
      if (mode === "module") await Promise.all([loadReaderIndex(), loadGraph()]);
      else if (mode === "proof") await loadGraph();
      else if (overview) await loadOverview();
      else await Promise.all([loadAtlas(), params.has("term") ? loadGraph() : null]);
      if (location.hash !== route) return;
      if (path && !state.pathIds.has(path)) await loadModules();
      if (termName && !state.wordIds.has(termName)) await loadWords();
    } catch {
      if (location.hash === route) {
        const retry = element("button", "view-button", "Retry");
        retry.onclick = () => restore(focus);
        panel.replaceChildren(note("This view could not be loaded."), retry);
      }
      return;
    }
    if (location.hash !== route) return;
  }
  input.disabled = false;
  if (state.focusSearch && mode !== "proof") input.focus();
  state.focusSearch = false;
  if (params.has("proof")) {
    setMode("proof");
    state.proofGraph.render(params.get("proof"), params.get("target"), params.get("via"));
    return;
  }
  const chapter = params.get("chapter");
  if (chapters.some(item => item.id === chapter)) state.chapter = chapter;
  if (params.has("mathlib")) {
    selectMathlib(params.get("mathlib"), params.get("decl") ?? "", false);
    return;
  }
  const module = state.pathIds?.get(params.get("module"));
  if (module !== undefined) {
    const parsedLine = Number(params.get("line"));
    const line = Number.isSafeInteger(parsedLine) && parsedLine > 0 ? parsedLine : 0;
    selectModule(module, line, false, params.get("decl") ?? "", params.get("tab"));
    if (focus) $("module-title").focus();
    return;
  }
  if (params.has("module")) {
    setMode("module");
    $("module-content").replaceChildren(note("This module is outside the source index."));
    return;
  }
  if (params.has("cluster")) {
    showRegion(params.get("cluster"), false);
    return;
  }
  state.fullProjection = params.get("projection") === "full";
  const term = state.wordIds.get(params.get("term"));
  selectTerm(term ?? state.firstTerm, params.get("view") === "source" ? "source" : "near", false);
}

function once(load) {
  let pending;
  return () => pending ??= load().catch(error => { pending = null; throw error; });
}
const loadChapters = once(async () => { ({chapters} = await import("./guide.js")); });
const loadMeta = once(async () => {
  const res = await fetch("data/meta.json");
  if (!res.ok) throw new Error("Corpus metadata unavailable");
  state.live = res.headers.get("X-Riemann-Reader") === "1";
  const meta = state.meta = await res.json();
  $("stat-lines").textContent = compact.format(meta.lines);
  $("stat-lines").title = number.format(meta.lines) + " Lean source lines";
  $("stat-files").textContent = number.format(meta.files);
  $("stat-terms").textContent = number.format(meta.terms);
  $("repo-link").href = `${meta.repository}/tree/${meta.revision}`;
  $("version").textContent = `${number.format(meta.tokens)} training tokens across ${number.format(meta.files)} modules. ${meta.epochs} training epochs. Source commit ${meta.revision.slice(0, 12)}.`;
});
const loadGraph = once(async () => {
  const [graph, {proofPaths}] = await Promise.all([
    packedIndex("proof-graph"), import("./paths.js"), loadMeta(),
  ]);
  state.graph = graph;
  if (!state.live) {
    useStaticReader(graph);
    $("lean-search-kind").querySelector('[value="declaration"]').textContent = "Indexed declarations";
  }
  const detailsFor = async (id, name) => {
    const [metadata, text] = await Promise.all([leanMetadata(id), cachedSource(id)]);
    const info = declarationDetails(metadata, [name, metadata.decls[name]], text);
    return {info, text, metadata};
  };
  state.proofGraph = proofPaths(graph, (id, line, name) => moduleHash(graph.paths[id], line, name),
    async (id, name) => (await detailsFor(id, name)).info.signature,
    async (parent, child) => {
      const [id] = graph.nodes[parent];
      const {info, text, metadata} = await detailsFor(id, parent);
      const path = graph.paths[id];
      const use = info.refs.find(ref => ref.inBody && ref.target === child &&
        "src/" + ref.module.replaceAll(".", "/") + ".lean" === graph.paths[graph.nodes[child][0]]);
      if (!use) return null;
      const span = metadata.refs.find(([sl, sc, el, , caller, module, target]) =>
        caller === parent && target === child && module === use.module && sl === el &&
        sl === use.line - 1 && sc === use.column);
      return {line: text.split("\n")[use.line - 1], start: span?.[1] ?? -1, end: span?.[3] ?? -1,
        href: moduleHash(path, use.line, parent), label: path.split("/").at(-1) + " · L" + use.line};
    });
});
const loadModules = once(async () => {
  const encodedPaths = await packedIndex("paths");
  let previous = "";
  const paths = encodedPaths.map(([prefix, suffix]) => {
    previous = previous.slice(0, prefix) + suffix;
    return previous;
  });
  state.fullDirectory = true;
  state.paths = paths;
  state.pathIds = new Map(paths.map((path, index) => [path, index]));
  state.featured = Array.from(featuredModules.keys(), path => state.pathIds.get(path)).filter(id => id !== undefined);
});
const loadReaderIndex = once(async () => {
  const [index] = await Promise.all([packedIndex("reader-index"), loadChapters()]);
  state.localModules = index.modules;
  if (state.fullDirectory) return;
  state.paths = index.paths;
  state.pathIds = new Map(Object.entries(index.paths).map(([id, path]) => [path, Number(id)]));
  state.featured = Array.from(featuredModules.keys(), path => state.pathIds.get(path)).filter(id => id !== undefined);
});
const loadWords = once(async () => {
  const vocab = await packedIndex("vocabulary");
  state.words = vocab.words;
  state.counts = vocab.counts;
  state.wordIds = new Map(vocab.words.map((name, id) => [name, id]));
  state.lowerWords = vocab.words.map(name => name.toLowerCase());
});
const landmarks = ["riemannZeta", "DirichletCharacter.LFunction", "Gm", "Complex.exp"];
function indexPlot(points) {
  state.globalPoints = points;
  state.globalPointIds = new Set(points.map(([id]) => id));
  state.globalLandmarks = landmarks.map(name => state.wordIds.get(name)).filter(id => id !== undefined);
  const start = ["riemannZeta", "RiemannHypothesis", "riemannHypothesis"].map(name => state.wordIds.get(name));
  state.firstTerm = start.find(id => state.globalPointIds.has(id)) ?? points[0][0];
}
function addWords(rows) {
  state.words ??= [];
  state.counts ??= [];
  state.wordIds ??= new Map();
  for (const [id, word] of rows) {
    state.words[id] = word;
    state.wordIds.set(word, id);
  }
}
const loadOverview = once(async () => {
  const [summary, catalog] = await Promise.all([packedIndex("atlas-overview"), import("./regions.js"), loadMeta(), loadChapters()]);
  if (state.atlasReady) return;
  const assignments = [];
  for (const [id, , , group] of summary.points) assignments[id] = group;
  for (const [id, , group] of summary.terms) assignments[id] = group;
  addWords(summary.terms);
  ({regionCard, globalOverview} = catalog);
  state.regions = new catalog.RegionIndex({regions: summary.regions, assignments});
  indexPlot(summary.points);
});
const loadAtlas = once(async () => {
  const [vocab, regions, renderer, catalog] = await Promise.all([
    packedIndex("atlas-index"), packedIndex("regions"), import("./map.js"), import("./regions.js"), loadMeta(), loadChapters(),
  ]);
  map = new renderer.EmbeddingMap($("map"), $("tooltip"), id => selectTerm(id));
  ({regionCard, globalOverview} = catalog);
  const meta = state.meta;
  addWords(vocab.terms);
  for (const [id, , count] of vocab.terms) state.counts[id] = count;
  state.firstMembers = vocab.first;
  if (regions.assignments.length !== meta.terms) throw new Error("Region membership does not match the vocabulary.");
  state.regions = new catalog.RegionIndex(regions);
  indexPlot(vocab.points);
  state.atlasReady = true;
  for (const parent of state.regions.parents) {
    const item = clusterButton(parent.title, parent.id, "region-legend-item");
    const dot = element("span", "term-dot");
    dot.style.setProperty("--dot", parent.color);
    item.prepend(dot);
    const highlight = active => {
      $("projection-caption").textContent = active ? parent.note : "Colors group identifiers by their usage in Lean. Regions can overlap in this two-dimensional view.";
      map.highlightRegion = active ? id => state.regions.forTerm(id)?.parent === parent : null;
      map.draw();
    };
    item.onpointerenter = item.onfocus = () => highlight(true);
    item.onpointerleave = item.onblur = () => highlight(false);
    $("region-colors").append(item);
  }
});

function openMap() {
  if (state.regions) {
    input.disabled = false;
    showRegion();
  }
  else {
    setLocation("#cluster=all");
    restore();
  }
}

export function activate(chapter) {
  state.chapter = chapter;
  $("guide-view").addEventListener("click", () => {
    setLocation(guideHash(state.chapter));
    showGuide(state.chapter);
  });
  $("proof-paths").addEventListener("click", event => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    const href = event.target.closest("a")?.getAttribute("href");
    if (!href?.startsWith("#module=")) return;
    trail.push({hash: location.hash, label: "proof path"});
  });
  $("paths-view").addEventListener("click", () => { location.hash = "#proof=riemannHypothesis"; });
  $("map-view").addEventListener("click", openMap);
  $("projection-toggle").addEventListener("click", () => {
    if (!state.regions) return;
    state.fullProjection = !state.fullProjection;
    selectTerm(state.term ?? state.firstTerm);
  });
  $("module-view").addEventListener("click", () => {
    if (state.localModules && state.proofGraph) selectModule(state.module ?? state.featured[0]);
    else {
      setLocation(moduleHash(mainPath, 0));
      restore();
    }
  });
  $("module-toggle").addEventListener("click", () => {
    input.value = "";
    clearSearch();
    toggleModuleView(!state.reading);
    renderModuleList("");
    $(state.reading ? "module-content" : "module-list").scrollTop = 0;
  });
  $("reader-wrap").addEventListener("click", () => {
    const wrapped = $("module-content").classList.toggle("wrap-lines");
    $("reader-wrap").setAttribute("aria-pressed", wrapped);
  });
  $("reader-scope").addEventListener("click", () => {
    state.reader.full = !state.reader.full;
    drawCode();
  });
  for (const key of ["declaration", "kernel", "uses", "module"]) {
    $(key + "-tab").addEventListener("click", () => {
      state.readerTab = key;
      renderReaderTabs();
    });
  }
  $("lean-search-kind").addEventListener("change", () => {
    input.focus();
    search();
  });
  $("near-tab").addEventListener("click", () => selectTerm(state.term, "near"));
  $("source-tab").addEventListener("click", () => selectTerm(state.term, "source"));
  $("zoom-in").addEventListener("click", () => map.zoom(1.3));
  $("zoom-out").addEventListener("click", () => map.zoom(1 / 1.3));
  $("reset-map").addEventListener("click", () => map.reset());
  input.addEventListener("input", search);
  input.addEventListener("focus", search);
  input.addEventListener("keydown", searchKeys);
  document.addEventListener("pointerdown", event => { if (!event.target.closest(".search")) clearSearch(); });
  document.addEventListener("focusin", event => { if (!event.target.closest(".search")) clearSearch(); });
  document.addEventListener("keydown", event => {
    if (event.key === "/" && !event.target.matches("input, textarea, select, [contenteditable]") && !$("about").open) {
      event.preventDefault();
      if (state.mode === "proof") { $("path-search").focus(); return; }
      if (state.mode === "guide") openMap();
      if (input.disabled) state.focusSearch = true;
      else input.focus();
    }
  });
}
