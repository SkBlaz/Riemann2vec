import {guideHash, moduleHash} from "./ui.js";

const escape = value => String(value).replace(/[&<>"']/g, char =>
  ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"})[char]);

export function navigation(chapters) {
  const options = chapters.map(c => `<option value="${escape(c.id)}">${escape(c.title)}</option>`);
  const links = [];
  let group;
  for (const c of chapters) {
    if (c.group !== group) {
      group = c.group;
      links.push(`<h3>${escape(group)}</h3>`);
    }
    const current = c === chapters[0] ? ' aria-current="page"' : '';
    links.push(`<a href="${guideHash(c.id)}" data-chapter="${escape(c.id)}"${current}>${escape(c.title)}</a>`);
  }
  return '<label class="chapter-choice">Chapter<select id="chapter-picker">' +
    options.join("") + '</select></label>' + links.join("");
}

export function chapterFields(c) {
  return {
    "chapter-title": escape(c.title),
    "chapter-summary": escape(c.summary),
    "chapter-formula": escape(c.formula),
    "chapter-reading": escape(c.reading),
    "chapter-sources": c.references.map(([path, line, name, purpose]) =>
      `<li><a class="chapter-source" href="${escape(moduleHash(path, line, "", c.id))}"><code>${escape(name)}</code><span class="source-line">L${line}</span></a><span class="chapter-source-caption">${escape(path.split("/").at(-1))} · ${escape(purpose)}</span></li>`).join(""),
    "chapter-next": c.next.map(([id, text]) => `<li><a href="${guideHash(id)}">${escape(text)}</a></li>`).join(""),
    "chapter-embedding": c.term ? `<a href="#term=${encodeURIComponent(c.term)}&amp;chapter=${encodeURIComponent(c.id)}">Explore ${escape(c.term)} in the embedding map</a>` : "",
  };
}
