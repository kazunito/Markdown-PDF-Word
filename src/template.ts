import { ExportConfig, ExportInput, Heading } from './types';

/**
 * Paged.js に渡す HTML と CSS の組み立て。
 * 表紙・目次・本文をそれぞれ別の @page として定義し、
 * ページ枠とページ番号をページ種別ごとに制御する。
 */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** ページ番号を置く余白ボックス名 (@bottom-center 等) */
function marginBox(position: string): string {
  const allowed = ['bottom-center', 'bottom-right', 'bottom-left', 'top-center', 'top-right'];
  return allowed.includes(position) ? `@${position}` : '@bottom-center';
}

/** 枠の指定。有効なら border と padding、無効なら明示的に打ち消す */
function frameRule(enabled: boolean, cfg: ExportConfig): string {
  return enabled
    ? `border: ${cfg.frame.width} solid ${cfg.frame.color}; padding: ${cfg.frame.padding};`
    : 'border: none; padding: 0;';
}

/** 見出しの装飾プリセット */
function headingStyleCss(cfg: ExportConfig): string {
  const { style, accentColor, textColor } = cfg.heading;

  if (style === 'band') {
    return `
h1 { background: ${accentColor}; color: #fff; padding: 1.2mm 3mm; }
h2 { color: ${textColor}; border-bottom: 0.4mm solid #333; padding-bottom: 0.8mm; }
h3 { color: ${textColor}; }
`;
  }
  if (style === 'underline') {
    return `
h1 { color: ${textColor}; border-bottom: 0.8mm solid ${accentColor}; padding-bottom: 1.5mm; }
h2 { color: ${textColor}; border-bottom: 0.3mm solid #666; padding-bottom: 1mm; }
`;
  }
  return '';
}

/** 章頭の改ページ規則。pageBreakLevel が 0 なら改ページしない */
function pageBreakCss(level: number): string {
  if (level <= 0) {
    return '';
  }
  const selectors = ['h1', 'h2', 'h3'].slice(0, level).join(', ');
  return `${selectors} { break-before: page; }`;
}

/** 印刷用 CSS 全体を組み立てる */
export function buildCss(cfg: ExportConfig): string {
  const box = marginBox(cfg.pageNumber.position);
  const pageNumberContent = cfg.pageNumber.enabled
    ? `${box} { content: counter(page); font-family: ${cfg.font.heading}; font-size: 9pt; }`
    : '';

  return `
/* ===== 本文ページ ===== */
@page {
  size: ${cfg.page.format} ${cfg.page.orientation};
  margin: ${cfg.page.margin};
  ${frameRule(cfg.frame.body, cfg)}
  ${pageNumberContent}
}

/* ===== 表紙・目次 =====
   counter-increment: page 0 で「このページはページ数に数えない」。
   これにより本文の 1 ページ目が 1 になる。
   counter-reset は Paged.js 0.4.3 で正しく伝播しないため使わない。 */
@page cover {
  ${frameRule(cfg.frame.cover, cfg)}
  counter-increment: page 0;
  ${box} { content: none; }
}
@page toc {
  ${frameRule(cfg.frame.toc, cfg)}
  counter-increment: page 0;
  ${box} { content: none; }
}

/* ===== 表紙 ===== */
#cover {
  page: cover;
  break-after: page;
  height: 100%;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  text-align: center;
}
#cover .docno {
  position: absolute; top: 0; left: 0;
  font-family: ${cfg.font.heading}; font-size: 10pt; letter-spacing: 0.05em;
}
#cover .stamp {
  position: absolute; top: 0; right: 0;
  font-family: ${cfg.font.heading}; font-weight: bold;
  font-size: 16pt; color: ${cfg.stamp.color}; letter-spacing: 0.15em;
  border: 2.5pt solid ${cfg.stamp.color}; border-radius: 2mm;
  padding: 2.5mm 5mm 2.5mm 6mm;
  transform: rotate(${cfg.stamp.rotate}deg);
  opacity: 0.85;
}
#cover .title    { font-size: 24pt; font-weight: bold; margin: 0 0 8mm; font-family: ${cfg.font.heading}; }
#cover .subtitle { font-size: 14pt; margin: 0 0 20mm; }
#cover .author,
#cover .date     { font-size: 11pt; margin: 2mm 0; }

/* ===== 目次 ===== */
#toc { page: toc; break-after: page; }
#toc .toc-title {
  font-size: 18pt; font-weight: bold; margin: 0 0 8mm;
  font-family: ${cfg.font.heading};
}
#toc ul { list-style: none; padding-left: 0; margin: 0; }
#toc ul ul { padding-left: 6mm; }
#toc li { margin: 1.5mm 0; }
/* 「見出し ……… ページ番号」の点線リーダー。
   CSS の leader() は未対応のため flex と点線ボーダーで代用する */
#toc a { text-decoration: none; color: #000; display: flex; align-items: baseline; }
#toc a::before {
  content: ""; order: 2; flex: 1 1 auto;
  border-bottom: 1px dotted #999; margin: 0 2mm;
}
#toc a::after { content: target-counter(attr(href), page); order: 3; }

/* ===== 書体 ===== */
body {
  font-family: ${cfg.font.body};
  font-size: ${cfg.font.size};
  line-height: ${cfg.font.lineHeight};
  margin: 0;
}
/* 見出しの大きさ。ブラウザ既定 (h1 = 2em) は帯が太くなりすぎるため明示する */
h1, h2, h3, h4, h5, h6 { font-family: ${cfg.font.heading}; line-height: 1.35; }
h1 { font-size: 14pt; margin: 0 0 4mm; }
h2 { font-size: 12pt; margin: 6mm 0 3mm; }
h3 { font-size: 11pt; margin: 5mm 0 2.5mm; }
h4, h5, h6 { font-size: 10.5pt; margin: 4mm 0 2mm; }
code, pre { font-family: ${cfg.font.mono}; font-size: 9pt; }
${headingStyleCss(cfg)}

/* ===== 改ページ ===== */
${pageBreakCss(cfg.heading.pageBreakLevel)}
#cover .title { break-before: auto; }
h1, h2, h3 { break-after: avoid; }
pre, img, figure, blockquote { break-inside: avoid; }
/* 表に break-inside: avoid を付けると表全体が次ページへ移動し、見出しだけが残る。
   表はページ境界で分割してよいものとし、行の途中では切らない */
tr, th, td { break-inside: avoid; }
/* 続きのページにも見出し行を出す指定。Paged.js 0.4.3 は未対応で現状は効かない
   (Word 出力は docx 側の tableHeader で繰り返される) */
thead { display: table-header-group; }

/* ===== ページ幅に収める ===== */
table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 9pt; }
th, td { border: 1px solid #999; padding: 3px 5px; word-break: break-all; }
th { background: #f2f2f2; }
img { max-width: 100%; height: auto; }
pre { white-space: pre-wrap; word-break: break-all; background: #f7f7f7; padding: 3mm; }
blockquote { margin: 0 0 0 5mm; padding-left: 3mm; border-left: 3px solid #ccc; color: #444; }
/* 収まらない図表は <div class="fit"> で囲んで縮小する */
.fit { zoom: 0.6; }
`;
}

/** 表紙の HTML。front matter に何も無ければ空文字を返す */
function buildCover(input: ExportInput, cfg: ExportConfig): string {
  if (!cfg.cover.enabled) {
    return '';
  }
  const m = input.meta;
  if (!m.title && !m.docno && !m.classification) {
    return '';
  }

  const parts: string[] = [];
  if (m.docno) {
    parts.push(`<p class="docno">${escapeHtml(m.docno)}</p>`);
  }
  if (m.classification) {
    parts.push(`<div class="stamp">${escapeHtml(m.classification)}</div>`);
  }
  if (m.title) {
    parts.push(`<p class="title">${escapeHtml(m.title)}</p>`);
  }
  if (m.subtitle) {
    parts.push(`<p class="subtitle">${escapeHtml(m.subtitle)}</p>`);
  }
  if (m.author) {
    parts.push(`<p class="author">${escapeHtml(m.author)}</p>`);
  }
  if (m.date) {
    parts.push(`<p class="date">${escapeHtml(m.date)}</p>`);
  }

  return `<section id="cover">\n${parts.join('\n')}\n</section>`;
}

/** 目次の HTML。見出しの階層をそのまま入れ子の ul にする */
function buildToc(headings: Heading[], cfg: ExportConfig): string {
  if (!cfg.toc.enabled) {
    return '';
  }
  const targets = headings.filter((h) => h.level <= cfg.toc.depth);
  if (targets.length === 0) {
    return '';
  }

  const lines: string[] = [];
  let current = 0;
  const minLevel = Math.min(...targets.map((h) => h.level));

  for (const h of targets) {
    const depth = h.level - minLevel;
    while (current < depth) {
      lines.push('<ul>');
      current++;
    }
    while (current > depth) {
      lines.push('</ul>');
      current--;
    }
    lines.push(`<li><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`);
  }
  while (current >= 0) {
    lines.push('</ul>');
    current--;
  }

  return `<section id="toc">
<p class="toc-title">${escapeHtml(cfg.toc.title)}</p>
<ul>
${lines.join('\n')}
</section>`;
}

/** Paged.js に渡す完成した HTML を組み立てる */
export function buildHtml(
  input: ExportInput,
  bodyHtml: string,
  headings: Heading[],
  cfg: ExportConfig,
  extraCss: string
): string {
  const title = input.meta.title || 'Document';
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
${buildCss(cfg)}
${extraCss}
</style>
</head>
<body>
${buildCover(input, cfg)}
${buildToc(headings, cfg)}
<section id="body">
${bodyHtml}
</section>
</body>
</html>`;
}
