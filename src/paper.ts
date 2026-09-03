import { ExportConfig } from './types';

/**
 * 用紙の寸法。
 *
 * PDF (Paged.js) と Word (docx) がそれぞれ寸法を持つと食い違うため、ここ 1 か所に置く。
 *
 * 用紙名を組版側に渡さないのは、名前の綴りの扱いが揃っていないため。
 * Paged.js の用紙表は letter・legal が小文字で、設定値の Letter・Legal では
 * 一致せず既定 (letter) に落ちる。B5 も Paged.js は ISO B5 (176x250mm) を指す。
 * そのため名前ではなく実寸を渡す。
 *
 * 単位は twip (1/1440 inch)。Word がこの単位で書くため twip を正とし、mm は割り算で導く。
 * 値は縦置きの [幅, 高さ]。
 */
const PAPER_TWIP: Record<string, [number, number]> = {
  A4: [11906, 16838], // 210 x 297mm
  A3: [16838, 23811], // 297 x 420mm
  B5: [10318, 14570], // 182 x 257mm (JIS B5)
  Letter: [12240, 15840], // 8.5 x 11 inch
  Legal: [12240, 20160], // 8.5 x 14 inch
};

/** 用紙の幅と高さ (twip)。印刷方向を反映する。未知の用紙名は A4 とみなす */
export function paperTwip(cfg: ExportConfig): { width: number; height: number } {
  const paper = PAPER_TWIP[cfg.page.format] || PAPER_TWIP['A4'];
  const landscape = cfg.page.orientation === 'landscape';
  return {
    width: landscape ? paper[1] : paper[0],
    height: landscape ? paper[0] : paper[1],
  };
}

/**
 * 縦置きのままの用紙の幅と高さ (twip)。
 * docx は横向きのとき自分で縦横を入れ替えるため、Word へはこちらを渡す
 * (入れ替え済みの値を渡すと二重に入れ替わって縦置きに戻る)。
 */
export function paperTwipUpright(cfg: ExportConfig): { width: number; height: number } {
  const paper = PAPER_TWIP[cfg.page.format] || PAPER_TWIP['A4'];
  return { width: paper[0], height: paper[1] };
}

/** 用紙の幅と高さ (mm)。CSS の @page に実寸で渡すために使う */
export function paperMm(cfg: ExportConfig): { width: number; height: number } {
  const twip = paperTwip(cfg);
  const toMm = (value: number): number => Math.round((value / 1440) * 25.4 * 10) / 10;
  return { width: toMm(twip.width), height: toMm(twip.height) };
}

/** 長さの指定 (18mm・0.5in など) を mm にする。単位が無ければ mm とみなす */
function lengthMm(value: string, fallback: number): number {
  const m = value.match(/([\d.]+)\s*(mm|cm|pt|in)?/);
  if (!m) {
    return fallback;
  }
  const n = parseFloat(m[1]);
  switch (m[2]) {
    case 'cm':
      return n * 10;
    case 'pt':
      return (n / 72) * 25.4;
    case 'in':
      return n * 25.4;
    default:
      return n;
  }
}

/**
 * 図の高さの上限 (mm)。
 * Paged.js は 1 ページに収まらない図を丸ごと落とす (白紙ページになる) ため、
 * 本文の高さに収まるところまで縮める。**Word も同じ値を使い、見え方を揃える**。
 */
function availableFigureHeightMm(cfg: ExportConfig): number {
  const frame = cfg.frame.body ? lengthMm(cfg.frame.padding, 5) * 2 : 0;
  const margin = lengthMm(cfg.page.margin, 18) * 2;
  // 12mm は図の上下余白 (3mm × 2) と、ぎりぎりで収まらず落とされないための余裕
  return paperMm(cfg).height - margin - frame - 12;
}

export function figureHeightLimitMm(cfg: ExportConfig): number {
  return Math.max(40, Math.min(cfg.mermaid.maxHeightMm, availableFigureHeightMm(cfg)));
}

/**
 * 見出しと同じページに置く図の高さの上限 (mm)。
 * 16mm は見出しの高さの見込み。これを引かないと見出しと図が 1 ページに入らず、
 * PDF は塊ごと次ページへ送られ、Word は見出しだけが前ページに残る。
 */
export function groupedFigureHeightLimitMm(cfg: ExportConfig): number {
  // 見出しの場所を確保した残りと、読みやすさの基準となる目標高さの小さい方を使う。
  // 横向きなどページが低い場合だけ、安全に収まる高さまで自動的に下げる。
  return Math.max(
    40,
    Math.min(cfg.mermaid.maxHeightMm, availableFigureHeightMm(cfg) - 16)
  );
}
