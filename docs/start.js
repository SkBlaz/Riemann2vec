const $ = id => document.getElementById(id);
const early = new AbortController();
const listen = (target, type, handler) => target.addEventListener(type, handler, {signal: early.signal});
let explorer, loading, styles, chapter = "statement", focusSearch = false;

function loadStyles() {
  return styles ??= new Promise((resolve, reject) => {
    const sheet = document.createElement("link");
    sheet.rel = "stylesheet";
    sheet.href = "explorer.css";
    sheet.onload = resolve;
    sheet.onerror = () => { styles = null; sheet.remove(); reject(new Error("Could not load explorer styles")); };
    document.head.append(sheet);
  });
}
async function route(focus = false) {
  $("load-retry").hidden = true;
  if (explorer) return explorer.restore(focus);
  const hash = location.hash;
  const params = new URLSearchParams(hash.slice(1));
  if (!["proof", "module", "mathlib", "cluster", "term"].some(key => params.has(key))) {
    delete document.documentElement.dataset.explorerEntry;
    const next = params.get("guide") || "statement";
    if (chapter === "statement" && next === chapter) {
      const {mountOpening} = await import("./opening.js");
      if (location.hash !== hash) return;
      mountOpening();
      if (focus) $("chapter-title").focus({preventScroll: true});
    } else {
      const {renderGuide} = await import("./guide-view.js");
      if (location.hash === hash) chapter = renderGuide(next, focus);
    }
    return;
  }
  try {
    loading ??= Promise.all([loadStyles(), import("./app.js")]).catch(error => { loading = null; throw error; });
    const [, app] = await loading;
    if (explorer) return;
    early.abort();
    explorer = app;
    app.activate(chapter);
    delete document.documentElement.dataset.explorerEntry;
    await app.restore(focus, focusSearch && location.hash === "#cluster=all");
  } catch {
    if (location.hash === hash) {
      delete document.documentElement.dataset.explorerEntry;
      const retry = $("load-retry");
      retry.hidden = false;
      retry.onclick = () => { retry.hidden = true; route(focus); };
    }
  }
}

for (const [id, hash] of [["paths-view","#proof=riemannHypothesis"],["module-view","#module=src%2FMain.lean"],["map-view","#cluster=all"]]) {
  listen($(id), "click", () => { location.hash = hash; });
}
listen($("guide-view"), "click", () => { location.hash = "#guide=" + chapter; });
listen(document, "keydown", event => {
  if (event.key !== "/" || event.target.matches("input,select,textarea,[contenteditable]") || $("about").open) return;
  event.preventDefault();
  focusSearch = true;
  location.hash = "#cluster=all";
});
$("about-button").onclick = () => $("about").showModal();
$("about").querySelector(".close").onclick = () => $("about").close();
window.addEventListener("hashchange", () => route(true));
$("chapter-picker").addEventListener("change", event => { location.hash = "#guide=" + event.target.value; });
route();
