// Pixel art from text: each row is a string, each character one cell, and the
// palette maps a character to an .art-* class (fills in src/index.css). A space or
// a character missing from the palette is transparent. Runs of one colour in a row
// become one <rect>, so a 20x24 portrait is tens of nodes, not hundreds.

export type Palette = Record<string, string>;

export function Pixels({ rows, palette, x = 0, y = 0 }: { rows: readonly string[]; palette: Palette; x?: number; y?: number }) {
  const rects: { key: string; x: number; y: number; w: number; cls: string }[] = [];
  rows.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      const cls = palette[row[c]];
      let end = c + 1;
      while (end < row.length && row[end] === row[c]) end++;
      if (cls) rects.push({ key: `${r}.${c}`, x: x + c, y: y + r, w: end - c, cls });
      c = end;
    }
  });
  return <>{rects.map((p) => <rect key={p.key} className={p.cls} x={p.x} y={p.y} width={p.w} height={1} />)}</>;
}
