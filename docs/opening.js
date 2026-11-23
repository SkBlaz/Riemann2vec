import {opening} from "./opening-data.js";
import {traceControl, sourceExcerpt} from "./trace-control.js";
import {element, moduleHash} from "./ui.js";
const $ = id => document.getElementById(id);

export function mountOpening() {
  if ($("opening-trace").firstChild) return;
  const control = traceControl(opening.map(row => row[0]), 0, (i, detail) => {
    const [name, path, line, text] = opening[i];
    $("opening-path").href = "#proof=riemannHypothesis&target=allChi&space=1&step=" + i;
    $("opening-path").querySelector("img").src = "opening-path.svg#step-" + i;
    const start = text.indexOf(name);
    const code = sourceExcerpt(text, start, start + name.length);
    const anchor = element("a", "", path.split("/").at(-1) + " · L" + line);
    anchor.href = moduleHash(path, line, name, "statement");
    detail.replaceChildren(code, anchor);
  });
  $("opening-trace").append(control);
}
