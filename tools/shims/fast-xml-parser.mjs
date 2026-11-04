// Tiny stand-in for fast-xml-parser's preserveOrder output, enough for OoTMM's
// data/checks/*.xml files. Keeps the build free of extra npm dependencies.
const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export const XMLValidator = { validate: () => true };

export class XMLParser {
  parse(text) {
    text = text.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '');
    const root = [];
    const stack = [{ children: root }];
    const tagRe = /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
    let last = 0, m;
    while ((m = tagRe.exec(text))) {
      const between = text.slice(last, m.index);
      if (between.trim()) throw new Error(`Unexpected text in XML: ${between.trim().slice(0, 40)}`);
      last = tagRe.lastIndex;
      const [, closing, tag, attrText, selfClose] = m;
      if (closing) {
        const top = stack.pop();
        if (top.tag !== tag) throw new Error(`Mismatched XML tag ${tag}, expected ${top.tag}`);
        continue;
      }
      const attrs = {};
      for (const a of attrText.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        attrs[a[1]] = decode(a[2] ?? a[3]);
      }
      const children = [];
      const node = { [tag]: children };
      if (Object.keys(attrs).length) node[':@'] = attrs;
      stack[stack.length - 1].children.push(node);
      if (!selfClose) stack.push({ tag, children });
    }
    if (stack.length !== 1) throw new Error('Unclosed XML tag');
    return root;
  }
}
