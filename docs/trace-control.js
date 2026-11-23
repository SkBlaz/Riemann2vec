// A native range keeps touch dragging and keyboard stepping on the same control.
export function traceControl(names, initial, select) {
  const panel = document.createElement("div");
  panel.className = "trace-control";
  const label = document.createElement("label");
  const caption = document.createElement("span");
  caption.textContent = "Trace path";
  const range = document.createElement("input");
  range.type = "range";
  range.min = 0;
  range.max = names.length - 1;
  range.step = 1;
  range.value = initial;
  range.disabled = names.length < 2;
  range.setAttribute("aria-label", "Proof path step");
  const position = document.createElement("span");
  position.className = "trace-position";
  label.append(caption, range, position);
  const detail = document.createElement("div");
  detail.className = "trace-detail";
  panel.append(label, detail);
  function update(event) {
    const i = range.valueAsNumber;
    position.textContent = i + " / " + range.max;
    range.setAttribute("aria-valuetext", "Step " + i + ", " + names[i]);
    range.style.setProperty("--progress", (names.length > 1 ? 100 * i / (names.length - 1) : 0) + "%");
    select(i, detail, Boolean(event));
  }
  range.addEventListener("input", update);
  update();
  return panel;
}

export function sourceExcerpt(text, start, end) {
  const code = document.createElement("code");
  if (start < 0 || end <= start) {
    code.textContent = text.trim();
    return code;
  }
  const mark = document.createElement("mark");
  mark.textContent = text.slice(start, end);
  code.append(text.slice(0, start).trimStart(), mark, text.slice(end).trimEnd());
  return code;
}
