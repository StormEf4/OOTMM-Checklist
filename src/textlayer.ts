/**
 * Edit mode's text layer. Any wording on screen can be replaced or hidden, so it
 * works on the rendered page rather than on each string in the code. Numbers are
 * read as {1}, {2} so "537 of 537 left" stays one editable phrase as counts change.
 */
export type TextLayer = { text: Record<string, string>; hide: Record<string, 'self' | 'group'> };

const NUM = /\d[\d,]*(?:\.\d+)?/g;
export const templateOf = (s: string) => { let n = 0; return s.replace(NUM, () => `{${++n}}`); };
const fill = (tpl: string, nums: string[]) => tpl.replace(/\{(\d+)\}/g, (m, i) => nums[+i - 1] ?? m);

const originals = new WeakMap<Node, string>();
const applied = new WeakMap<Node, string>();
const attrSeen = new WeakMap<Element, Record<string, { from: string; to: string }>>();
const ATTRS = ['placeholder', 'aria-label', 'title'];

export function originalOf(node: Node) {
  const cur = node.nodeValue ?? '';
  return applied.get(node) === cur ? originals.get(node) ?? cur : cur;
}
export function originalAttr(el: Element, attr: string) {
  const cur = el.getAttribute(attr) ?? '';
  const seen = attrSeen.get(el)?.[attr];
  return seen && seen.to === cur ? seen.from : cur;
}

function translate(raw: string, layer: TextLayer) {
  const core = raw.trim();
  if (!core) return null;
  const key = templateOf(core);
  const to = layer.text[key];
  if (to === undefined) return null;
  return raw.replace(core, () => fill(to, core.match(NUM) ?? []));
}

const hideTarget = (from: Element, how: 'self' | 'group') => how === 'group'
  ? from.closest('.box, .set, .cat, section, .seg, .chips, .legend, .toolrow') ?? from
  : from.closest('button, label, summary, .chip, h1, h2, h3, p, .desc') ?? from;

export function applyLayer(root: Element, layer: TextLayer) {
  root.querySelectorAll('.ghost').forEach(e => e.classList.remove('ghost'));
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || parent.closest('[data-locked], textarea')) continue;
    const orig = originalOf(node);
    const next = translate(orig, layer);
    if (next !== null) {
      if (node.nodeValue !== next) node.nodeValue = next;
      originals.set(node, orig);
      applied.set(node, next);
    } else if (node.nodeValue !== orig) {
      node.nodeValue = orig;
    }
    const how = layer.hide[templateOf(orig.trim())];
    if (how) hideTarget(parent, how).classList.add('ghost');
  }
  root.querySelectorAll(ATTRS.map(a => `[${a}]`).join(',')).forEach(el => {
    if (el.closest('[data-locked]')) return;
    for (const attr of ATTRS) {
      if (!el.hasAttribute(attr)) continue;
      const orig = originalAttr(el, attr);
      const next = translate(orig, layer) ?? orig;
      if (el.getAttribute(attr) !== next) el.setAttribute(attr, next);
      const seen = attrSeen.get(el) ?? {};
      seen[attr] = { from: orig, to: next };
      attrSeen.set(el, seen);
    }
  });
}

/** The text node under a click, falling back to the first text in the element. */
export function textAt(x: number, y: number, target: Element): Node | null {
  const d = document as any;
  let node: Node | null = null;
  if (d.caretRangeFromPoint) node = d.caretRangeFromPoint(x, y)?.startContainer ?? null;
  else if (d.caretPositionFromPoint) node = d.caretPositionFromPoint(x, y)?.offsetNode ?? null;
  if (node?.nodeType === Node.TEXT_NODE && node.nodeValue?.trim()) {
    const r = document.createRange();
    r.selectNodeContents(node);
    const b = r.getBoundingClientRect();
    if (x >= b.left - 6 && x <= b.right + 6 && y >= b.top - 6 && y <= b.bottom + 6 && target.contains(node)) return node;
  }
  /* Blank space in a big container shouldn't grab whatever text comes first in it. */
  if (target.matches('#app, .pane, .scroll, .rail, .regions, .page, .toolbar, .toolrow, .rows, section, .brand, .box, .cat, .sheet, .bottom, .tabs')) return null;
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.nodeValue?.trim()) return n;
  return null;
}
