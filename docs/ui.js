export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
export function moduleHash(path, line, name, chapter) {
  const params = new URLSearchParams({module: path});
  if (line) params.set("line", line);
  if (name) params.set("decl", name);
  if (chapter) params.set("chapter", chapter);
  return "#" + params.toString();
}
export function guideHash(id) { return `#guide=${id}`; }

export function guideLink(id, label) {
  const anchor = element("a", "", label);
  anchor.href = guideHash(id);
  return anchor;
}
