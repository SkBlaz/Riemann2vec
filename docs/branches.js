// Partition the selected node's reachable set by its possible first steps.
export function branchStructure(nodes, root) {
  const reachCount = new Map();
  const branches = nodes[root][2].map(first => {
    const seen = new Set([first]);
    for (const node of seen) {
      for (const child of nodes[node][2]) if (child !== root) seen.add(child);
    }
    for (const name of seen) reachCount.set(name, (reachCount.get(name) ?? 0) + 1);
    return {first, seen};
  });
  const rows = branches.map(({first, seen}) => ({
    first, total: seen.size, exclusive: Array.from(seen).filter(name => reachCount.get(name) === 1).length,
  })).sort((a,b) => b.total-a.total || a.first.localeCompare(b.first));
  const shared = [...reachCount].filter(([,count]) => count > 1)
    .sort(([a,i],[b,j]) => j-i || a.localeCompare(b));
  return {rows, shared, total: reachCount.size};
}

export function branchPanel(nodes, root, pathHash) {
  const section = document.createElement("section");
  section.className = "path-branches";
  const heading = document.createElement("h4");
  heading.textContent = "Where the path branches";
  const {rows, shared, total} = branchStructure(nodes, root);
  if (rows.length < 2) return section;
  const caption = document.createElement("p");
  caption.textContent = `${rows.length} first steps reach ${total} indexed declarations. Dark bars count declarations reachable only through that step. Light bars count those also reachable through another step.`;
  section.append(heading, caption);
  function entry({first, total, exclusive}) {
    const anchor = document.createElement("a");
    anchor.href = pathHash(root, first);
    const label = document.createElement("code");
    label.textContent = first.split(".").at(-1);
    anchor.title = first;
    anchor.setAttribute("aria-label", first + ", " + exclusive + " exclusive of " + total + " reachable");
    const count = document.createElement("small");
    count.textContent = exclusive + " / " + total;
    const bar = document.createElement("i");
    bar.setAttribute("aria-hidden", "true");
    bar.style.width = (100 * total / rows[0].total) + "%";
    bar.style.setProperty("--exclusive", (100 * exclusive / total) + "%");
    anchor.append(label, count, bar);
    return anchor;
  }
  for (const row of rows.slice(0, 5)) section.append(entry(row));
  if (rows.length > 5) {
    const rest = document.createElement("details");
    const toggle = document.createElement("summary");
    toggle.textContent = "All " + rows.length + " first steps";
    rest.append(toggle, ...rows.slice(5).map(entry));
    section.append(rest);
  }
  if (shared.length) {
    const group = document.createElement("details");
    const title = document.createElement("summary");
    title.textContent = "Shared dependencies (" + shared.length + ")";
    group.append(title);
    group.addEventListener("toggle", () => {
      if (!group.open || group.children.length > 1) return;
      for (const [name, count] of shared) {
        const a = document.createElement("a");
        a.href = pathHash(root, name);
        a.textContent = name;
        const label = document.createElement("small");
        label.textContent = count + " branches";
        a.append(label);
        group.append(a);
      }
    });
    section.append(group);
  }
  return section;
}
