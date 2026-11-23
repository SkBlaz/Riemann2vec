export class EmbeddingMap {
  constructor(canvas, tooltip, onSelect) {
    this.canvas = canvas;
    this.tooltip = tooltip;
    this.ctx = canvas.getContext("2d");
    this.words = [];
    this.points = [];
    this.byX = [];
    this.position = new Map();
    this.onSelect = onSelect;
    this.neighbors = [];
    this.contacts = new Map();
    this.reset();
    new ResizeObserver(() => this.resize()).observe(canvas);
    canvas.addEventListener("pointerdown", event => this.pointerDown(event));
    canvas.addEventListener("pointermove", event => this.pointerMove(event));
    canvas.addEventListener("pointerup", event => this.pointerUp(event));
    canvas.addEventListener("pointercancel", event => this.pointerUp(event, true));
    canvas.addEventListener("lostpointercapture", event => {
      if (this.contacts.has(event.pointerId)) this.pointerUp(event, true);
    });
    canvas.addEventListener("keydown", event => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const delta = 40;
      switch (event.key) {
        case "+": case "=": this.zoom(1.3); break;
        case "-": this.zoom(1 / 1.3); break;
        case "Home": this.reset(); break;
        case "ArrowLeft": this.offsetX += delta; break;
        case "ArrowRight": this.offsetX -= delta; break;
        case "ArrowUp": this.offsetY += delta; break;
        case "ArrowDown": this.offsetY -= delta; break;
        default: return;
      }
      event.preventDefault();
      this.hideTooltip();
      this.draw();
    });
    canvas.addEventListener("pointerleave", () => {
      if (!this.drag) this.hideTooltip();
    });
    canvas.addEventListener("wheel", event => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      this.zoom(event.deltaY < 0 ? 1.15 : 1 / 1.15, event.offsetX, event.offsetY, true);
    }, { passive: false });
  }

  setData(words, points, color, labels) {
    this.words = words;
    this.points = points.map(([id, x, y], order) => ({id, x, y, order, color: color(id)}));
    this.byX = [...this.points].sort((a, b) => a.x - b.x);
    this.position = new Map(this.points.map(point => [point.id, point]));
    this.landmarks = labels.map(id => this.position.get(id)).filter(Boolean);
    this.highlightRegion = null;
    this.draw();
  }

  resize() {
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    if (!this.width || !this.height) return;
    const density = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.width = this.width * density;
    this.canvas.height = this.height * density;
    this.ctx.setTransform(density, 0, 0, density, 0, 0);
    this.draw();
  }

  reset() {
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.hideTooltip();
    this.draw();
  }

  zoom(factor, x = this.width / 2, y = this.height / 2, coalesce = false) {
    const next = Math.max(0.65, Math.min(8, this.scale * factor));
    const ratio = next / this.scale;
    this.offsetX = x - this.width / 2 - (x - this.width / 2 - this.offsetX) * ratio;
    this.offsetY = y - this.height / 2 - (y - this.height / 2 - this.offsetY) * ratio;
    this.scale = next;
    this.hideTooltip();
    if (coalesce) this.scheduleDraw();
    else this.draw();
  }

  scheduleDraw() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.draw(); });
  }

  get pixelsPerUnit() {
    return Math.max(1, Math.min(this.width / 2 - 24, this.height / 2 - 50)) * this.scale;
  }

  location(point) {
    const spread = this.pixelsPerUnit;
    return [
      this.width / 2 + this.offsetX + point.x * spread,
      this.height / 2 + this.offsetY - point.y * spread,
    ];
  }

  setSelection(id, neighbors, reveal) {
    this.preview = undefined;
    this.selected = id;
    this.neighbors = neighbors.map(item => item.id).filter(key => this.position.has(key));
    const point = this.position.get(id);
    if (reveal && point) {
      const [x, y] = this.location(point);
      if (x < 35 || x > this.width - 80 || y < 55 || y > this.height - 72) {
        this.offsetX += this.width / 2 - x;
        this.offsetY += this.height / 2 - y;
      }
    }
    this.draw();
  }

  draw() {
    const { ctx, width, height } = this;
    if (!width || !height) return;
    ctx.fillStyle = "#171717";
    ctx.fillRect(0, 0, width, height);

    const [originX, originY] = this.location({x: 0, y: 0});
    const step = 38 * this.scale;
    ctx.strokeStyle = "#ffffff0f";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = originX % step; x < width; x += step) {
      ctx.moveTo(x, 44);
      ctx.lineTo(x, height - 43);
    }
    for (let y = 44 + (originY - 44) % step; y < height - 43; y += step) {
      ctx.moveTo(20, y);
      ctx.lineTo(width - 20, y);
    }
    ctx.stroke();
    ctx.strokeStyle = "#ffffff38";
    ctx.beginPath();
    ctx.moveTo(20, originY);
    ctx.lineTo(width - 20, originY);
    ctx.moveTo(originX, 45);
    ctx.lineTo(originX, height - 52);
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.rect(8, 41, width - 16, height - 80);
    ctx.clip();
    const size = Math.min(3, 1.15 + .55 * this.scale);
    const spread = this.pixelsPerUnit;
    ctx.globalAlpha = .72;
    for (const point of this.points) {
      const x = originX + point.x * spread;
      const y = originY - point.y * spread;
      if (x < 8 || x > width - 8 || y < 41 || y > height - 39) continue;
      ctx.fillStyle = this.highlightRegion && !this.highlightRegion(point.id) ? "#454545" : point.color;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    this.labels = [];
    const selected = this.position.get(this.selected);
    const related = this.neighbors.map(id => this.position.get(id));
    if (selected) {
      const [x, y] = this.location(selected);
      ctx.strokeStyle = "#ffffffbc";
      ctx.beginPath();
      for (const point of related) {
        const [px, py] = this.location(point);
        ctx.moveTo(x, y);
        ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.fillStyle = "#ffffff32";
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
    }
    for (const point of related) this.dot(point, 3.5, "#ffffff");
    if (selected) {
      this.dot(selected, 5, "#ffffff");
      const [x, y] = this.location(selected);
      this.label(selected.id, x, y, true);
    }
    const preview = this.position.get(this.preview);
    if (preview) {
      const [x, y] = this.location(preview);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, 2 * Math.PI);
      ctx.stroke();
      this.label(preview.id, x, y, true);
    }
    for (const point of related) {
      if (point === preview) continue;
      const [x, y] = this.location(point);
      this.label(point.id, x, y, false);
    }
    for (const point of this.landmarks ?? []) {
      if (point.id === this.selected || this.neighbors.includes(point.id) || (this.highlightRegion && !this.highlightRegion(point.id))) continue;
      const [x, y] = this.location(point);
      this.dot(point, 3.1, point.color);
      this.label(point.id, x, y, false);
    }
    ctx.restore();
  }

  dot(point, radius, color) {
    const [x, y] = this.location(point);
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
    this.ctx.fill();
  }

  label(id, x, y, selected) {
    const word = this.words[id];
    const { ctx, width, height } = this;
    if (x < 9 || x > width - 9 || y < 46 || y > height - 48) return;
    const label = word.length > 28 ? word.slice(0, 27) + "…" : word;
    ctx.font = `${selected ? "700" : "500"} 12px ui-monospace, monospace`;
    const size = ctx.measureText(label).width + 12;
    const slots = [[x + 11, y - 10], [x - size - 11, y - 10], [x - size / 2, y - 30]];
    const clear = ([left, top]) => left >= 9 && left + size < width - 9 &&
      top >= 43 && top + 20 < height - 41 && !this.labels.some(box =>
        left < box.right + 4 && left + size > box.left - 4 &&
        top < box.bottom + 4 && top + 20 > box.top - 4);
    const slot = slots.find(clear);
    if (!slot && !selected) return;
    const [left, top] = slot ?? [Math.max(9, Math.min(x + 11, width - size - 9)), Math.max(43, y - 10)];
    this.labels.push({id, left, top, right: left + size, bottom: top + 20});
    ctx.fillStyle = selected ? "#ffffff" : "#171717eb";
    ctx.beginPath();
    ctx.roundRect(left, top, size, 20, 4);
    ctx.fill();
    ctx.fillStyle = selected ? "#111111" : "#dfdfdf";
    ctx.fillText(label, left + 6, top + 14);
  }

  closest(x, y) {
    const label = this.labels?.find(box =>
      x >= box.left && x <= box.right && y >= box.top && y <= box.bottom);
    if (label) return this.position.get(label.id);
    let best = 64;
    let nearest;
    if (y < 43 || y > this.height - 35) return undefined;
    // Only points in this eight-pixel strip can win the hit test at the current zoom.
    const spread = this.pixelsPerUnit;
    const [originX, originY] = this.location({x: 0, y: 0});
    const minX = (x - originX - 8) / spread;
    const maxX = (x - originX + 8) / spread;
    let lo = 0, hi = this.byX.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.byX[mid].x < minX) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < this.byX.length && this.byX[i].x <= maxX; i++) {
      const point = this.byX[i];
      const px = originX + point.x * spread, py = originY - point.y * spread;
      const distance = (x - px) ** 2 + (y - py) ** 2;
      if (distance < best || (distance === best && nearest && point.order < nearest.order)) {
        best = distance;
        nearest = point;
      }
    }
    return nearest;
  }

  hideTooltip() { this.tooltip.hidden = true; }

  pointerDown(event) {
    if (event.button !== 0) return;
    if (this.contacts.size >= 2) return;
    this.contacts.set(event.pointerId, {x: event.offsetX, y: event.offsetY});
    this.drag = { x: event.offsetX, y: event.offsetY, ox: this.offsetX, oy: this.offsetY, moved: this.contacts.size === 2 };
    this.canvas.setPointerCapture(event.pointerId);
    this.hideTooltip();
  }

  pointerMove(event) {
    const x = event.offsetX;
    const y = event.offsetY;
    if (this.drag && !this.contacts.has(event.pointerId)) return;
    if (this.contacts.size === 2) {
      const old = this.contacts.get(event.pointerId);
      const other = [...this.contacts.values()].find(point => point !== old);
      const before = Math.hypot(other.x - old.x, other.y - old.y);
      const after = Math.hypot(other.x - x, other.y - y);
      this.contacts.set(event.pointerId, {x, y});
      this.offsetX += (x - old.x) / 2;
      this.offsetY += (y - old.y) / 2;
      this.zoom(before > 0 && after > 0 ? after / before : 1, (other.x + x) / 2, (other.y + y) / 2, true);
      return;
    }
    if (this.drag) {
      this.contacts.set(event.pointerId, {x, y});
      const dx = x - this.drag.x;
      const dy = y - this.drag.y;
      if (Math.hypot(dx, dy) > 4) this.drag.moved = true;
      if (this.drag.moved) {
        this.offsetX = this.drag.ox + dx;
        this.offsetY = this.drag.oy + dy;
        this.canvas.dataset.interaction = "drag";
        this.scheduleDraw();
      }
      return;
    }
    const target = this.closest(x, y);
    this.canvas.dataset.interaction = target ? "point" : "";
    if (!target) {
      this.hideTooltip();
      return;
    }
    this.tooltip.textContent = this.words[target.id];
    this.tooltip.hidden = false;
    this.tooltip.style.left = Math.max(8, Math.min(x + 12, this.width - this.tooltip.offsetWidth - 9)) + "px";
    this.tooltip.style.top = Math.max(38, y - 35) + "px";
  }

  pointerUp(event, cancelled = false) {
    if (!this.contacts.delete(event.pointerId)) return;
    if (this.contacts.size) {
      const [remaining] = this.contacts.values();
      this.drag = {...remaining, ox: this.offsetX, oy: this.offsetY, moved: true};
      return;
    }
    const target = cancelled || this.drag.moved ? undefined : this.closest(event.offsetX, event.offsetY);
    this.endDrag();
    if (target) this.onSelect(target.id);
  }

  endDrag() {
    this.drag = undefined;
    this.canvas.dataset.interaction = "";
  }
}
