import {traceControl, sourceExcerpt} from "./trace-control.js";
import {packedIndex} from "./assets.js";
let pending;
function data() {
  return pending ??= packedIndex("path-overlay").catch(error => { pending = null; throw error; });
}

const ns = "http://www.w3.org/2000/svg";
function svg(name, attributes = {}) {
  const node = document.createElementNS(ns, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

function addFullscreen(container, toolbar, list) {
  const toggle = document.createElement("button");
  toggle.className = "view-button";
  toolbar.append(toggle);
  const host = container.parentElement;
  let dialog;
  const slot = document.createComment("path list");
  const sync = () => {
    const expanded = document.fullscreenElement === container || Boolean(dialog?.open);
    if (expanded && list.parentElement !== container) {
      list.before(slot);
      container.append(list);
    } else if (!expanded && slot.parentNode) {
      slot.replaceWith(list);
    }
    toggle.textContent = expanded ? "Exit fullscreen" : "Fullscreen";
  };
  function exit() {
    if (dialog?.open) dialog.close();
    else if (document.fullscreenElement === container) return document.exitFullscreen();
  }
  toggle.onclick = async () => {
    if (dialog?.open || document.fullscreenElement === container) {
      await exit();
      return;
    }
    if (document.fullscreenEnabled && container.requestFullscreen) {
      try { await container.requestFullscreen(); return; } catch {}
    }
    if (!container.isConnected) return;
    dialog = document.createElement("dialog");
    dialog.className = "atlas-dialog";
    dialog.setAttribute("aria-label", "Proof path atlas");
    host.append(dialog);
    dialog.append(container);
    dialog.onclose = () => {
      host.append(container);
      dialog.remove();
      dialog = null;
      sync();
      toggle.focus({preventScroll: true});
    };
    dialog.showModal();
    sync();
    toggle.focus();
  };
  container.addEventListener("fullscreenchange", sync);
  container.addEventListener("click", event => {
    if (event.target.closest("a") && !event.ctrlKey && !event.metaKey && !event.shiftKey) exit();
  });
  sync();
}

export async function drawOverlay(container, chain, list, findUse) {
  const {background, positions} = await data();
  if (!container.isConnected) return;
  const chart = svg("svg", {viewBox: "0 0 400 400", role: "group", "aria-label": "Proof path on the global embedding projection"});
  const scale = n => 200 + n * 181;
  const points = chain.map(name => {
    const p = positions[name];
    return p && {x: scale(p[0]), y: scale(-p[1]), count: p[2]};
  });
  chart.append(svg("path", {d: "M10 200H390 M200 10V390", stroke: "#414141"}));
  // One drawing element per region keeps the backdrop cheap to render.
  const marks = new Map();
  for (const [x, y, color] of background) {
    const d = marks.get(color) || "";
    marks.set(color, d + "M" + scale(x).toFixed(1) + " " + scale(-y).toFixed(1) + "h.1");
  }
  for (const [color, d] of marks) chart.append(svg("path", {d, stroke: color, opacity: .48, "stroke-width": 3, "stroke-linecap": "round"}));
  const edges = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (a && b) {
      edges[i] = svg("line", {x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: "white", "stroke-width": 1.8});
      chart.append(edges[i]);
    }
  }
  const caption = document.createElement("p");
  const summary = points.filter(Boolean).length + " of " + chain.length + " declarations placed.";
  caption.textContent = summary;
  const occupied = [];
  const markers = [];
  points.forEach((p, i) => {
    const item = list.children[i];
    const link = item.querySelector("a");
    const hint = !p ? "No embedded identifier or references" : p.count ? "Mean of " + p.count + " distinct embedded reference spellings" : "Exact identifier vector";
    item.dataset.placement = !p ? "Unplaced" : p.count ? "Reference mean" : "Identifier";
    link.title = hint;
    link.setAttribute("aria-description", hint);
    if (!p) return;
    const a = svg("a", {href: link.getAttribute("href"), "aria-label": "Open step " + i + ", " + chain[i]});
    const title = svg("title");
    title.textContent = i + ". " + chain[i] + " · " + hint;
    let best, score = -Infinity;
    for (const radius of [14, 24, 36, 48]) {
      for (let angle = -Math.PI / 4; angle < Math.PI * 1.7; angle += Math.PI / 4) {
        const x = p.x + radius * Math.cos(angle), y = p.y + radius * Math.sin(angle);
        if (x < 13 || x > 387 || y < 13 || y > 387) continue;
        const space = Math.min(24, ...occupied.map(q => Math.hypot(x-q.x,y-q.y)),
          ...points.filter(Boolean).map(q => Math.hypot(x-q.x,y-q.y) + 7)) - radius / 12;
        if (space > score) { score = space; best = {x,y}; }
      }
    }
    occupied.push(best);
    a.append(title, svg("line", {x1:p.x,y1:p.y,x2:best.x,y2:best.y,stroke:"#ddd"}),
      svg("circle", {cx:p.x,cy:p.y,r:4,fill:p.count ? "#151515" : "white",stroke:"white","stroke-width":2}),
      svg("circle",{cx:best.x,cy:best.y,r:10,fill:"#171717",stroke:"#ddd"}));
    const text = svg("text", {x:best.x,y:best.y+4,fill:"white","text-anchor":"middle","font-size":12});
    text.textContent = i;
    a.append(text);
    const active = on => {
      item.classList.toggle("path-lit", on);
      a.classList.toggle("path-lit", on);
      text.setAttribute("fill", on ? "#ffdb94" : "white");
    };
    for (const el of [a,link]) {
      el.onfocus = el.onpointerenter = () => active(true);
      el.onblur = el.onpointerleave = () => active(false);
    }
    markers[i] = a;
    chart.append(a);
  });
  const toolbar = document.createElement("div");
  toolbar.className = "overlay-tools";
  toolbar.append(caption);
  const key = document.createElement("p");
  key.className = "overlay-key";
  key.textContent = "● Identifier　○ Reference mean　━ Dependency step";
  const foot = document.createElement("div");
  foot.className = "overlay-foot";
  let timer;
  const stepParam = new URLSearchParams(location.hash.slice(1)).get("step");
  const requested = stepParam === null ? NaN : Number(stepParam);
  const initial = Number.isInteger(requested) && requested >= 0 && requested < chain.length ? requested : chain.length - 1;
  const control = traceControl(chain, initial, (step, detail, moved) => {
    if (moved) {
      const params = new URLSearchParams(location.hash.slice(1));
      params.set("step", step);
      history.replaceState(history.state, "", "#" + params);
    }
    clearTimeout(timer);
    markers.forEach((mark, i) => mark.classList.toggle("step-selected", i === step));
    edges.forEach((edge, i) => edge.classList.toggle("step-edge", i === step));
    Array.from(list.children).forEach((item, i) => item.classList.toggle("step-selected", i === step));
    const stepLink = list.children[step].querySelector("a").cloneNode(true);
    stepLink.className = "trace-name";
    detail.replaceChildren(stepLink);
    if (!step) return;
    if (!points[step]) stepLink.append(" (unplaced)");
    const evidence = document.createElement("div");
    evidence.className = "trace-use";
    detail.append(evidence);
    const parent = chain[step - 1];
    timer = setTimeout(async () => {
      if (!evidence.isConnected) return;
      let use;
      try { use = await findUse(parent, chain[step]); } catch {}
      if (!evidence.isConnected) return;
      const link = document.createElement("a");
      if (use) {
        const code = sourceExcerpt(use.line, use.start, use.end);
        link.href = use.href;
        link.textContent = "Use in " + use.label;
        evidence.append(code, link);
      } else {
        link.href = list.children[step - 1].querySelector("a").getAttribute("href") + "&tab=kernel";
        link.textContent = "Compiled references in " + parent;
        evidence.append(link);
      }
    }, 90);
  });
  foot.append(control, key);
  container.replaceChildren(toolbar, chart, foot);
  const visible = points.filter(Boolean);
  if (visible.length) {
    const xs = visible.map(p => p.x), ys = visible.map(p => p.y);
    const left = Math.min(...xs), right = Math.max(...xs);
    const top = Math.min(...ys), bottom = Math.max(...ys);
    const side = Math.min(400, Math.max(145, right-left+85, bottom-top+85));
    if (side < 380) {
      const offset = center => Math.max(0, Math.min(400-side, center-side/2));
      const box = [offset((left+right)/2), offset((top+bottom)/2), side, side].join(" ");
      const focus = document.createElement("button");
      focus.className = "view-button";
      focus.textContent = "Whole atlas";
      chart.setAttribute("viewBox", box);
      focus.title = "Switch between the full projection and the path extent";
      focus.onclick = () => {
        const zoom = chart.getAttribute("viewBox") === "0 0 400 400";
        chart.setAttribute("viewBox", zoom ? box : "0 0 400 400");
        focus.textContent = zoom ? "Whole atlas" : "Fit path";
      };
      toolbar.append(focus);
    }
  }
  addFullscreen(container, toolbar, list);
}
