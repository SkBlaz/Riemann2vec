const number = new Intl.NumberFormat("en-US");

export class RegionIndex {
  constructor(data) {
    this.parents = data.regions;
    this.assignments = data.assignments;
    this.byId = new Map();
    this.byAssignment = new Map();
    for (const parent of this.parents) {
      this.byId.set(parent.id, parent);
      parent.children.forEach(leaf => {
        leaf.parent = parent;
        leaf.color = parent.color;
        this.byId.set(leaf.id, leaf);
        const [parentNumber, leafNumber] = leaf.id.split(".").map(Number);
        this.byAssignment.set(parentNumber * 3 + leafNumber, leaf);
      });
    }
  }

  forTerm(id) {
    return this.byAssignment.get(this.assignments[id]);
  }

  color(id) {
    return this.forTerm(id)?.color ?? "#aaa";
  }
}

export function regionCard(region, words, select) {
  const card = document.createElement("button");
  card.className = "region-card";
  card.style.setProperty("--region-color", region.color);
  card.addEventListener("click", () => select(region.id));
  const drawing = document.createElement("canvas");
  drawing.width = drawing.height = 240;
  drawing.setAttribute("aria-hidden", "true");
  const ctx = drawing.getContext("2d");
  ctx.strokeStyle = "#434343";
  ctx.beginPath();
  ctx.moveTo(8, 120);
  ctx.lineTo(232, 120);
  ctx.moveTo(120, 7);
  ctx.lineTo(120, 233);
  ctx.stroke();
  ctx.fillStyle = region.color;
  ctx.globalAlpha = .93;
  for (const [x, y] of region.preview) {
    ctx.beginPath();
    ctx.arc(120 + x * 102, 120 - y * 102, 3, 0, 2 * Math.PI);
    ctx.fill();
  }

  const title = document.createElement("strong");
  title.textContent = region.title;
  const count = document.createElement("span");
  count.className = "region-card-count";
  const size = number.format(region.count);
  count.textContent = region.children ? `${size} terms · ${region.children.length} subclusters` : `${size} terms`;
  const example = document.createElement("span");
  example.className = "region-card-example";
  example.textContent = region.examples.slice(0, 2).map(id => words[id]).join(" · ");
  const description = document.createElement("span");
  description.className = "region-card-note";
  description.textContent = region.note;
  const text = document.createElement("span");
  text.className = "region-card-text";
  text.append(title, description, example, count);
  card.append(drawing, text);
  return card;
}

// Each overview uses the same global PCA coordinates, including when a region is selected.
export function globalOverview(points, index, region, open) {
  const figure = document.createElement("figure");
  figure.className = "global-overview";
  const canvas = document.createElement("canvas");
  canvas.width = 340;
  canvas.height = 340;
  canvas.setAttribute("aria-hidden", "true");
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#191919";
  ctx.fillRect(0, 0, 340, 340);
  ctx.strokeStyle = "#424242";
  ctx.beginPath();
  ctx.moveTo(20, 170);
  ctx.lineTo(320, 170);
  ctx.moveTo(170, 12);
  ctx.lineTo(170, 328);
  ctx.stroke();
  const draw = (color, selectedOnly) => {
    for (const [id, x, y] of points) {
      if (selectedOnly && index.forTerm(id).parent !== region) continue;
      ctx.fillStyle = color ?? index.color(id);
      ctx.fillRect(170 + x * 155, 170 - y * 155, 2.3, 2.3);
    }
  };
  draw(region ? "#505050" : null, false);
  if (region) draw(region.color, true);
  const button = document.createElement("button");
  button.className = "region-more";
  button.textContent = "Open full projection";
  button.addEventListener("click", open);
  const caption = document.createElement("figcaption");
  caption.textContent = region
    ? "Colored points show this region within the global projection."
    : `Global PCA of ${number.format(points.length)} sampled identifiers.`;
  figure.append(canvas, caption, button);
  return figure;
}
