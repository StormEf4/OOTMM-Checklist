/* The Notes tab: one page of formatted notes per seed, edited like a word processor. Notes are stored as a small,
   safe subset of HTML. Anything pasted, dropped or loaded from a transfer code is cleaned to that subset first. */

const BLOCKS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'HR', 'BR']);
const INLINE = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'SPAN', 'FONT', 'MARK', 'SUB', 'SUP', 'A', 'CODE']);
const STYLES = new Set(['color', 'background-color', 'text-align', 'font-size', 'font-family', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'margin-left', 'padding-left']);
const SAFE_VALUE = /^[#(),.%\w\s'"-]*$/;

/** Cleans HTML down to the formatting the notes page supports. Unknown tags keep their text. */
export function cleanNotes(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const walk = (el: Element) => {
    for (const child of [...el.children]) {
      const tag = child.tagName;
      if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'SVG', 'MATH', 'IMG', 'VIDEO', 'AUDIO', 'LINK', 'META', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'FORM'].includes(tag)) { child.remove(); continue; }
      walk(child);
      if (!BLOCKS.has(tag) && !INLINE.has(tag)) { child.replaceWith(...child.childNodes); continue; }
      for (const attr of [...child.attributes]) {
        const name = attr.name.toLowerCase();
        if (name === 'style') {
          const kept = attr.value.split(';').map(x => x.trim()).filter(Boolean).filter(decl => {
            const [k, ...rest] = decl.split(':');
            const v = rest.join(':').trim();
            return STYLES.has(k.trim().toLowerCase()) && SAFE_VALUE.test(v) && !/url|expression/i.test(v);
          });
          if (kept.length) child.setAttribute('style', kept.join('; ')); else child.removeAttribute('style');
        } else if (name === 'href' && tag === 'A' && /^https?:\/\//i.test(attr.value)) {
          child.setAttribute('target', '_blank'); child.setAttribute('rel', 'noopener');
        } else if (name === 'class' && (tag === 'UL' || tag === 'LI') && /^(doc-check|done)$/.test(attr.value)) {
          /* checklist marks */
        } else if (name === 'color' && tag === 'FONT' && SAFE_VALUE.test(attr.value)) {
          /* older color markup */
        } else if (!(tag === 'A' && (name === 'target' || name === 'rel'))) {
          child.removeAttribute(attr.name);
        }
      }
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

/** Plain notes from older versions, as paragraphs. */
export function textToNotes(text: string): string {
  if (!text) return '';
  const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
  return text.split(/\r?\n/).map(line => `<p>${line ? esc(line) : '<br>'}</p>`).join('');
}

export type NotesView = { size?: 'letter' | 'a4' | 'fit'; zoom?: number; paper?: boolean };
export const PAGE_SIZES: [NonNullable<NotesView['size']>, string][] = [['letter', 'Letter'], ['a4', 'A4'], ['fit', 'Fit to screen']];
export const ZOOMS = [0.75, 1, 1.25, 1.5];
