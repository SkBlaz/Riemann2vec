import {chapters} from "./guide.js";
import {chapterFields} from "./guide-markup.js";
import {mountOpening} from "./opening.js";
const $ = id => document.getElementById(id);

export function renderGuide(id, focus = false) {
  const chapter = chapters.find(item => item.id === id) ?? chapters[0];
  for (const anchor of $("proof-nav").querySelectorAll("[data-chapter]")) {
    if (anchor.dataset.chapter === chapter.id) anchor.setAttribute("aria-current", "page");
    else anchor.removeAttribute("aria-current");
  }
  const firstChapter = chapter.id === "statement";
  $("opening-path").hidden = $("opening-study").hidden = !firstChapter;
  if (firstChapter) mountOpening();
  $("chapter-picker").value = chapter.id;
  for (const [id, html] of Object.entries(chapterFields(chapter))) $(id).innerHTML = html;
  if (focus) $("chapter-title").focus({preventScroll: true});
  return chapter.id;
}
