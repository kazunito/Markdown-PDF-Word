/**
 * 表の列の幅の調整。PDF (exporter.ts) と Word (docx.ts) で同じ基準を使う。
 *
 * 列の幅は PDF・Word とも中身から自動で決まる。日本語はどの文字の間でも改行できるため、
 * 隣の列に長い文があると、短い列 (番号・章・地域など) が 1 文字分近くまで削られ、
 * 「番号」「第 10 章」が途中で改行される。
 * 列のすべてのセル (見出しを含む) が短い場合だけ、その列を改行しない。
 * 長い文を含む列は、他の列を圧迫しないよう今までどおり改行させる。
 */

/** 改行しない列とみなすセルの文字数の上限 */
export const SHORT_CELL_CHARS = 8;

/** 文字数を数える。前後と連続する空白は 1 つにまとめる */
function charCount(text: string): number {
  return Array.from(text.replace(/\s+/g, ' ').trim()).length;
}

/**
 * 列ごとに「改行しない短い列か」を返す。rows[行][列] はセルの文字列。
 * 空のセルは判定に使わない (全部空の列は対象外)。
 */
export function shortColumns(rows: string[][]): boolean[] {
  const columns = Math.max(0, ...rows.map((r) => r.length));
  const result: boolean[] = [];
  for (let c = 0; c < columns; c++) {
    const cells = rows.map((r) => r[c] ?? '').filter((t) => t.trim() !== '');
    result.push(cells.length > 0 && cells.every((t) => charCount(t) <= SHORT_CELL_CHARS));
  }
  return result;
}

/** 文字列の幅を全角 1 文字 = 1 として見積もる (半角は 0.55) */
export function textWidthEm(text: string): number {
  return Array.from(text.replace(/\s+/g, ' ').trim()).reduce(
    (sum, ch) => sum + ((ch.codePointAt(0) || 0) >= 0x2e80 || /[①-⓿]/.test(ch) ? 1 : 0.55),
    0
  );
}
