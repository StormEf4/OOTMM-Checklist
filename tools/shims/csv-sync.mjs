// Stand-in for csv/sync: OoTMM's gossip tables are simple comma-separated files.
export function parse(content) {
  const rows = content.split(/\r?\n/).filter(l => l.trim()).map(l => l.split(',').map(c => c.trim()));
  const head = rows.shift();
  return rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}
