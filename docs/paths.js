import {branchPanel} from "./branches.js";
const $ = id => document.getElementById(id);
const root = "riemannHypothesis";
const landmark = "UpperTheory.FinalTheorems.everyCharacter";
const order = (a, b) => a.localeCompare(b);
const tag = (kind, text) => Object.assign(document.createElement(kind), {textContent: text});
export const pathHash = (origin, target) =>
  "#" + new URLSearchParams(target ? {proof: origin, target} : {proof: origin});

export function proofPaths(graph, sourceUrl, signature, findUse) {
  const nodes = graph.nodes;
  let origin, target, via, depth, entries, counts;
  let overlayOpen = true;
  let parent = new Map(), distance = new Map();
  const origins = Object.keys(nodes).sort(order);
  $("path-origin").addEventListener("focus", () => {
    $("path-origins").replaceChildren(...origins.map(name => Object.assign(document.createElement("option"), {value: name})));
  }, {once: true});
  function traverse(start) {
    origin = start;
    distance = new Map([[start, 0]]);
    parent = new Map();
    const queue = [start];
    for (let i = 0; i < queue.length; i++) {
      const from = queue[i];
      for (const next of nodes[from][2]) {
        if (distance.has(next)) continue;
        parent.set(next, from);
        distance.set(next, distance.get(from) + 1);
        queue.push(next);
      }
    }
    counts = [];
    for (const n of distance.values()) counts[n] = (counts[n] || 0) + 1;
    entries = queue.slice(1).sort((a,b) => distance.get(a) - distance.get(b) || order(a,b));
  }
  traverse(root);
  const fromRH = new Map(distance);
  origin = null;
  function reference(name) {
    const a = document.createElement("a");
    const steps = fromRH.get(name);
    a.href = steps === undefined ? pathHash(name) : pathHash(root, name);
    a.textContent = steps === undefined ? "Explore dependencies from " + name
      : name + " · " + steps + (steps === 1 ? " step" : " steps") + " from RH";
    a.className = "proof-path-link";
    return a;
  }
  function source(name, text) {
    const [module, line] = nodes[name];
    const a = tag("a", text);
    a.href = sourceUrl(module, line, name);
    a.title = name + " · line " + line;
    return a;
  }
  function renderTrace() {
    const panel = $("path-trace");
    const n = distance.get(target);
    const chain = [];
    const previous = target === origin || n === undefined ? [] : entries.concat(origin).filter(name =>
      distance.get(name) === n - 1 && nodes[name][2].includes(target));
    const penultimate = previous.includes(via) ? via : parent.get(target);
    for (let name = target; name && distance.has(name); name = name === target ? penultimate : parent.get(name))
      chain.unshift(name);
    panel.replaceChildren(tag("h3", chain.length ? (n === 0 ? "Starting declaration" : "Shortest indexed path") : "No indexed path"));
    if (!chain.length) {
      panel.append(tag("p", "The indexed graph contains no directed route from this origin to the requested declaration."));
    } else {
      panel.append(tag("p", n === 1 ? "1 dependency step" : n + " dependency steps"));
      const list = document.createElement("ol");
      list.start = 0;
      for (const name of chain) {
        const li = document.createElement("li");
        li.append(source(name, name));
        list.append(li);
      }
      const overlay = tag("details", "");
      overlay.className = "path-overlay";
      const space = new URLSearchParams(location.hash.slice(1)).get("space");
      overlay.open = space === null ? overlayOpen : space === "1";
      const plot = tag("div", "");
      overlay.append(tag("summary", "Path in embedding space"), plot);
      let drawn = false;
      async function toggleOverlay() {
        if (!overlay.isConnected) return;
        overlayOpen = overlay.open;
        const params = new URLSearchParams(location.hash.slice(1));
        if (params.has("proof")) {
          if (overlay.open) params.set("space", "1");
          else params.set("space", "0");
          history.replaceState(null, "", "#" + params);
        }
        list.classList.toggle("show-placements", overlay.open);
        if (!overlay.open || drawn) return;
        drawn = true;
        plot.textContent = "Loading the global projection…";
        try {
          const {drawOverlay} = await import("./path-overlay.js");
          await drawOverlay(plot, chain, list, findUse);
        } catch {
          drawn = false;
          plot.textContent = "Projection unavailable. Reopen to retry.";
        }
      }
      overlay.ontoggle = toggleOverlay;
      const pair = document.createElement("div");
      pair.className = "path-pair";
      pair.append(overlay, list);
      panel.append(pair);
      if (overlay.open) toggleOverlay();
      if (previous.length > 1) {
        const label = tag("label", "Last step through ");
        const select = document.createElement("select");
        select.setAttribute("aria-label", "Last step on a shortest path");
        for (const name of previous) select.append(Object.assign(tag("option", name), {value: name}));
        select.value = penultimate;
        select.onchange = () => {
          location.hash = pathHash(origin, target) + "&" + new URLSearchParams({via: select.value});
          requestAnimationFrame(() => $("path-trace").querySelector("select")?.focus());
        };
        label.append(select);
        panel.append(label);
      }
      const [module, , outgoing, total] = nodes[target];
      if (outgoing.length > 1) panel.append(branchPanel(nodes, target, pathHash));
      const heading = tag("h4", "Endpoint declaration");
      const statement = tag("pre", "Loading Lean statement…");
      statement.className = "code lean-signature path-signature";
      signature(module, target).then(text => { statement.textContent = text; })
        .catch(() => { statement.textContent = "Open the declaration to read its source."; });
      panel.append(heading, statement);
      if (total !== null) {
        const evidence = tag("p", outgoing.length + " of " + total + " direct body references in this index. ");
        const all = source(target, "Inspect kernel references");
        all.href += "&tab=kernel";
        evidence.append(all);
        panel.append(evidence);
      }
      if (target !== origin) {
        const onward = tag("a", "Explore dependencies from here");
        onward.href = pathHash(target);
        panel.append(onward);
      }
    }
    const scope = tag("p", `Coverage includes ${origins.length.toLocaleString("en-US")} source declarations in ${graph.modules} indexed modules. Additional modules may supply shorter paths.`);
    scope.className = "path-coverage";
    panel.append(scope);
  }
  function results(limit = 50) {
    const text = $("path-search").value.trim().toLowerCase();
    const matches = entries.filter(name => (depth === null || distance.get(name) === depth) && name.toLowerCase().includes(text));
    $("path-count").textContent = matches.length + (matches.length === 1 ? " reachable declaration" : " reachable declarations");
    $("path-results").replaceChildren(...matches.slice(0, limit).map(name => {
      const a = document.createElement("a");
      a.href = pathHash(origin, name);
      a.addEventListener("click", event => {
        if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey)
          requestAnimationFrame(() => $("path-trace").focus({preventScroll: !matchMedia("(max-width:710px)").matches}));
      });
      if (name === target) a.setAttribute("aria-current", "true");
      a.append(tag("code", name), tag("small", distance.get(name) === 1 ? "1 step" : distance.get(name) + " steps"));
      return a;
    }));
    if (matches.length > limit) {
      const more = tag("button", "Show more declarations");
      more.className = "region-more";
      more.onclick = () => { results(limit + 50); $("path-results").children[limit]?.focus(); };
      $("path-results").append(more);
    }
  }
  function depths() {
    const levels = counts.slice(1).map((_, i) => i + 1);
    const peak = Math.max(1, ...counts.slice(1));
    $("path-depths").replaceChildren(...[null, ...levels].map(level => {
      const b = tag("button", level === null ? "All steps" : level);
      if (level !== null) {
        b.style.setProperty("--bar", (counts[level] / peak * 100) + "%");
        b.title = counts[level] + " declarations at distance " + level;
      }
      b.setAttribute("aria-label", level === null ? "All steps" : "Exactly " + level + " dependency steps");
      b.setAttribute("aria-pressed", level === depth);
      b.onclick = () => { depth = level; depths(); results(); $("path-depths").querySelector('[aria-pressed="true"]').focus(); };
      return b;
    }));
  }
  $("origin-form").onsubmit = event => {
    event.preventDefault();
    const field = $("path-origin");
    const typed = field.value.trim();
    const matches = Object.hasOwn(nodes, typed) ? [typed]
      : origins.filter(n => n.split(".").at(-1).toLowerCase() === typed.toLowerCase());
    if (matches.length !== 1) {
      field.setCustomValidity(matches.length ? "Several declarations share this name. Choose a qualified name." : "Choose a declaration from the index.");
      field.reportValidity();
      return;
    }
    field.value = matches[0];
    location.hash = pathHash(matches[0]);
  };
  $("path-origin").oninput = () => $("path-origin").setCustomValidity("");
  $("path-search").oninput = () => results();
  function render(start = root, end, predecessor) {
    via = predecessor;
    if (!Object.hasOwn(nodes, start)) {
      $("path-trace").replaceChildren(tag("p", "Starting declaration outside this index."));
      $("path-origin").value = start;
      $("path-results").replaceChildren(); $("path-depths").replaceChildren();
      $("path-count").textContent = "";
      entries = []; origin = null;
      return;
    }
    const changedOrigin = origin !== start;
    if (changedOrigin) {
      traverse(start);
      $("path-search").value = "";
      depth = null;
    }
    $("path-origin").value = origin;
    $("path-origin").setCustomValidity("");
    target = end || (origin === root && distance.has(landmark) ? landmark : entries[0] || origin);
    if (changedOrigin) {
      depths();
      results();
    } else {
      const selected = pathHash(origin, target);
      for (const link of $("path-results").querySelectorAll("a")) {
        if (link.getAttribute("href") === selected) link.setAttribute("aria-current", "true");
        else link.removeAttribute("aria-current");
      }
    }
    renderTrace();
  }
  return {render, reference, names: origins};
}
