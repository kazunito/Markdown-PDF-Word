import {
  AlignmentType,
  Bookmark,
  BookmarkEnd,
  BookmarkStart,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  ImageRun,
  IParagraphStylePropertiesOptions,
  ISectionOptions,
  LevelFormat,
  LineRuleType,
  PageNumber,
  Packer,
  Paragraph,
  ParagraphChild,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TableOfContents,
  TextRun,
  WidthType,
} from 'docx';
import MarkdownIt from 'markdown-it';
import * as path from 'path';
// トークン変数 t と紛れないよう別名で受ける
import { t as translate } from './i18n';
import Token from 'markdown-it/lib/token.mjs';
import { isRemoteImage, loadLocalImage } from './image';
import { MermaidImage, renderMermaid } from './mermaid';
import { groupedFigureHeightLimitMm, MERMAID_MAX_SCALE, paperTwip, paperTwipUpright } from './paper';
import { renderStamp, StampImage } from './stamp';
import { shortColumns, textWidthEm } from './table';
import { ExportConfig, ExportInput } from './types';

/**
 * Word (docx) 出力。
 * PDF とは別の描画経路で、CSS は使えないため docx の指定に読み替える。
 * 位置づけは編集用ドラフト。正本は PDF。
 */

/** CSS のフォント指定リストから先頭のフォント名だけ取り出す */
function firstFont(cssFontList: string): string {
  const first = cssFontList.split(',')[0] || '';
  return first.trim().replace(/^["']|["']$/g, '') || 'Yu Gothic';
}

/** "10.5pt" を docx のハーフポイント (21) に変換する */
function toHalfPoints(size: string): number {
  const m = size.match(/([\d.]+)\s*pt/);
  const pt = m ? parseFloat(m[1]) : 10.5;
  return Math.round(pt * 2);
}

/**
 * 行の高さを固定値 (twip) で指定する。PDF (CSS) の line-height は「文字の大きさ × 倍率」だが、
 * Word の倍数指定は「書体の標準の行の高さ × 倍率」で、日本語書体では PDF より広くなる。
 * 固定値にして PDF と同じ高さに揃える。
 */
function exactLine(pt: number, ratio: number): { line: number; lineRule: typeof LineRuleType.EXACT } {
  return { line: Math.round(pt * ratio * 20), lineRule: LineRuleType.EXACT };
}

/** 画像を含む段落の行の高さ。固定値だと画像が行の高さで切れるため、自動にする */
const AUTO_LINE = { line: 240, lineRule: LineRuleType.AUTO };

/** 表・コードブロックの文字の大きさ (pt)。PDF の table / pre { font-size: 9pt } と同じ */
const SMALL_TEXT_PT = 9;

/** 段落が画像を含むか */
function hasImage(token: Token | undefined): boolean {
  return (token?.children || []).some((c) => c.type === 'image');
}

/** "#4472C4" を docx の "4472C4" に変換する */
function toDocxColor(color: string): string {
  return color.replace(/^#/, '').toUpperCase();
}

/** ```mermaid のコードブロックかどうか */
function isMermaidFence(token: Token): boolean {
  return (
    token.type === 'fence' && (token.info || '').trim().split(/\s+/)[0].toLowerCase() === 'mermaid'
  );
}

/** "18mm" を twip (1/1440 inch) に変換する */
function toTwip(value: string): number {
  const m = value.match(/([\d.]+)\s*(mm|cm|pt|in)?/);
  if (!m) {
    return 1080; // 既定 = 約 19mm
  }
  const n = parseFloat(m[1]);
  switch (m[2]) {
    case 'cm':
      return Math.round((n / 2.54) * 1440);
    case 'pt':
      return Math.round(n * 20);
    case 'in':
      return Math.round(n * 1440);
    case 'mm':
    default:
      return Math.round((n / 25.4) * 1440);
  }
}

/** 行内トークン (太字・斜体・コード・リンク) を docx の子要素に変換する */
/** 本文の画像を読むための情報。baseDir は元の Markdown のフォルダ */
interface ImageContext {
  baseDir: string;
  /** 貼れなかった画像の理由 (重複は 1 回だけ通知する) */
  failed: Set<string>;
}

/**
 * 本文の画像を ImageRun にする。PDF 側の img { max-width: 100% } と同じく、
 * 元の大きさより拡大せず、本文の幅と図の高さの上限に収める。
 * 貼れないときは undefined を返し、呼び出し側が説明文 (alt) を文字で出す。
 */
function imageToRun(src: string, cfg: ExportConfig, images: ImageContext): ImageRun | undefined {
  if (isRemoteImage(src)) {
    images.failed.add(`${src.slice(0, 60)} (remote images are not embedded)`);
    return undefined;
  }
  const { image, error } = loadLocalImage(src, images.baseDir);
  if (!image) {
    images.failed.add(error || src);
    return undefined;
  }
  if (image.type === 'svg' || image.width === 0 || image.height === 0) {
    images.failed.add(`${src} (only PNG / JPEG / GIF are supported in Word)`);
    return undefined;
  }
  const box = bodyBoxPx(cfg);
  let width = Math.min(image.width, box.width);
  let height = Math.round((image.height / image.width) * width);
  if (height > box.height) {
    width = Math.round((image.width / image.height) * box.height);
    height = box.height;
  }
  return new ImageRun({
    type: image.type,
    data: image.data,
    transformation: { width, height },
  });
}

/** 段落が画像だけでできているか (中央に寄せるかの判定に使う) */
function isImageOnly(token: Token | undefined): boolean {
  const children = (token?.children || []).filter(
    (c) => !(c.type === 'softbreak' || (c.type === 'text' && c.content.trim() === ''))
  );
  return children.length > 0 && children.every((c) => c.type === 'image');
}

function inlineToRuns(
  token: Token | undefined,
  cfg: ExportConfig,
  images?: ImageContext
): ParagraphChild[] {
  if (!token || !token.children) {
    return token ? [new TextRun(token.content || '')] : [];
  }

  const runs: ParagraphChild[] = [];
  let bold = false;
  let italic = false;
  let linkHref: string | null = null;
  let linkBuffer: TextRun[] = [];

  const push = (run: TextRun) => {
    if (linkHref !== null) {
      linkBuffer.push(run);
    } else {
      runs.push(run);
    }
  };

  for (const child of token.children) {
    switch (child.type) {
      case 'text':
        push(new TextRun({ text: child.content, bold, italics: italic }));
        break;
      case 'strong_open':
        bold = true;
        break;
      case 'strong_close':
        bold = false;
        break;
      case 'em_open':
        italic = true;
        break;
      case 'em_close':
        italic = false;
        break;
      case 'code_inline':
        push(
          new TextRun({
            text: child.content,
            font: firstFont(cfg.font.mono),
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F0F0F0' },
          })
        );
        break;
      case 'link_open':
        linkHref = child.attrGet('href');
        linkBuffer = [];
        break;
      case 'link_close': {
        const href = linkHref;
        linkHref = null;
        if (href && href.startsWith('http')) {
          runs.push(new ExternalHyperlink({ children: linkBuffer, link: href }));
        } else {
          runs.push(...linkBuffer);
        }
        linkBuffer = [];
        break;
      }
      case 'softbreak':
        push(new TextRun({ text: ' ' }));
        break;
      case 'hardbreak':
        push(new TextRun({ text: '', break: 1 }));
        break;
      case 'image': {
        const run = images ? imageToRun(child.attrGet('src') || '', cfg, images) : undefined;
        if (run) {
          runs.push(run);
        } else if (child.content) {
          push(new TextRun({ text: child.content, bold, italics: italic }));
        }
        break;
      }
      default:
        if (child.content) {
          push(new TextRun({ text: child.content, bold, italics: italic }));
        }
    }
  }

  if (linkBuffer.length > 0) {
    runs.push(...linkBuffer);
  }
  return runs.length > 0 ? runs : [new TextRun('')];
}

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

/** 表のトークン列から docx の Table を組み立てる */
function buildTable(
  tokens: Token[],
  start: number,
  cfg: ExportConfig,
  images?: ImageContext
): { table: Table; next: number } {
  const rows: TableRow[] = [];
  let cells: TableCell[] = [];
  let isHeader = false;
  let i = start + 1;

  // 改行しない短い列 (table.ts) を先に調べ、その列のセルに中身が収まる幅を指定する。
  // 表は自動調整のままなので、幅は「希望する幅」として扱われ、長い列が残りを使う
  const texts: string[][] = [];
  for (let j = start + 1; j < tokens.length && tokens[j].type !== 'table_close'; j++) {
    if (tokens[j].type === 'tr_open') {
      texts.push([]);
    } else if (tokens[j].type === 'th_open' || tokens[j].type === 'td_open') {
      texts[texts.length - 1]?.push(inlineText(tokens[j + 1]));
    }
  }
  const short = shortColumns(texts);
  const columnTwip = short.map((isShort, c) =>
    isShort
      ? // 9pt の文字幅 + セルの左右の余白 (既定 108twip × 2) + 少しの余裕
        Math.ceil(Math.max(...texts.map((r) => textWidthEm(r[c] ?? ''))) * SMALL_TEXT_PT * 20) + 216 + 60
      : 0
  );

  while (i < tokens.length && tokens[i].type !== 'table_close') {
    const t = tokens[i];
    switch (t.type) {
      case 'thead_open':
        isHeader = true;
        break;
      case 'thead_close':
        isHeader = false;
        break;
      case 'tr_open':
        cells = [];
        break;
      case 'tr_close':
        // PDF 側の tr { break-inside: avoid } と同じ意図。行の途中で改ページせず、
        // 入りきらない行は行ごと次ページへ送る (表全体は送らない)
        rows.push(new TableRow({ children: cells, tableHeader: isHeader, cantSplit: true }));
        break;
      case 'th_open':
      case 'td_open': {
        const inline = tokens[i + 1];
        const width = columnTwip[cells.length];
        cells.push(
          new TableCell({
            width: width ? { size: width, type: WidthType.DXA } : undefined,
            children: [
              new Paragraph({
                // 文字の大きさと行の高さは表用の段落スタイル (MfTableText) で PDF に揃える
                style: 'MfTableText',
                children: inlineToRuns(inline, cfg, images).map((r) =>
                  r instanceof TextRun && isHeader ? r : r
                ),
                spacing: { before: 20, after: 20, ...(hasImage(inline) ? AUTO_LINE : {}) },
              }),
            ],
            shading: isHeader
              ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F2F2F2' }
              : undefined,
          })
        );
        break;
      }
    }
    i++;
  }

  return {
    table: new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }),
    next: i,
  };
}

/**
 * Word の図の入る箱の幅と高さ (ピクセル)。
 * 幅は用紙と余白から求める。高さは PDF と同じ上限 (paper.ts) を使う。
 * 本文の高さいっぱいを許すと、見出しと図が 1 ページに入らず
 * 見出しだけが前のページに残る (keepNext があっても Word は入りきらないと守れない)。
 */
function bodyBoxPx(cfg: ExportConfig): { width: number; height: number } {
  const paper = paperTwip(cfg);
  const margin = toTwip(cfg.page.margin) * 2;
  const toPx = (twip: number): number => Math.max(96, Math.round((twip / 1440) * 96));
  const mmToPx = (mm: number): number => Math.max(96, Math.round((mm / 25.4) * 96));
  return { width: toPx(paper.width - margin), height: mmToPx(groupedFigureHeightLimitMm(cfg)) };
}

/**
 * markdown-it のトークン列を docx の段落・表に変換する。
 * mermaid には renderMermaid の結果を出現順に入れる (空なら図にしない)。
 */
/** 目次に最初から入れておく項目 (docx の TableOfContents の cachedEntries) */
interface TocEntry {
  title: string;
  level: number;
  href: string;
}

/** 見出しの表示文字列。強調などの記号を除いた文字だけを返す */
function inlineText(token: Token | undefined): string {
  if (!token) {
    return '';
  }
  if (!token.children) {
    return token.content;
  }
  return token.children
    .map((c) => (c.type === 'text' || c.type === 'code_inline' ? c.content : ''))
    .join('');
}

function tokensToDocx(
  tokens: Token[],
  cfg: ExportConfig,
  mermaid: MermaidImage[] = [],
  images?: ImageContext,
  tocEntries: TocEntry[] = []
): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  let listDepth = -1;
  let ordered = false;
  let quote = false;
  let mermaidIndex = 0;
  const bodyPt = toHalfPoints(cfg.font.size) / 2;

  // 目次に載せる見出しにブックマークを付け、目次の項目からその見出しへ移れるようにする
  const tocBookmark = (
    level: number,
    inline: Token | undefined,
    runs: ParagraphChild[]
  ): ParagraphChild[] => {
    if (!cfg.toc.enabled || level > cfg.toc.depth) {
      return runs;
    }
    const number = tocEntries.length + 1;
    const href = `_MF_TOC_${number}`;
    tocEntries.push({ title: inlineText(inline), level, href });
    // docx の Bookmark は文書全体で番号を数えず、すべての印に同じ番号 (1) を付ける。
    // 番号の重複は Word の形式に反するため、印ごとに別の番号で作り直す
    const bookmark = new Bookmark({ id: href, children: runs }) as any;
    bookmark.start = new BookmarkStart(href, number);
    bookmark.end = new BookmarkEnd(number);
    return [bookmark as Bookmark];
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    switch (t.type) {
      case 'heading_open': {
        const level = Number(t.tag.slice(1));
        const inline = tokens[i + 1];
        out.push(
          new Paragraph({
            heading: HEADING_LEVELS[Math.min(level, 6) - 1],
            // PDF 側の pageBreakCss と同じ基準で、設定した階層までの見出しの前で改ページする。
            // 本文の先頭見出しで改ページすると白紙ページが出るので除く
            pageBreakBefore: level <= cfg.heading.pageBreakLevel && out.length > 0,
            // PDF 側の h1, h2, h3 { break-after: avoid } と同じ意図。
            // 見出しだけがページ末尾に取り残されないよう、次の段落と離さない
            keepNext: true,
            keepLines: true,
            children: tocBookmark(level, inline, inlineToRuns(inline, cfg, images)),
          })
        );
        i += 2;
        break;
      }

      case 'paragraph_open': {
        const inline = tokens[i + 1];
        const line = hasImage(inline) ? AUTO_LINE : exactLine(bodyPt, cfg.font.lineHeight);
        if (listDepth >= 0) {
          out.push(
            new Paragraph({
              children: inlineToRuns(inline, cfg, images),
              spacing: line,
              ...(ordered
                ? { numbering: { reference: 'mf-ordered', level: listDepth } }
                : { bullet: { level: listDepth } }),
            })
          );
        } else {
          out.push(
            new Paragraph({
              children: inlineToRuns(inline, cfg, images),
              spacing: line,
              // 画像だけの段落は PDF の図と同じく中央に置く
              alignment: !quote && isImageOnly(inline) ? AlignmentType.CENTER : undefined,
              indent: quote ? { left: 400 } : undefined,
              border: quote
                ? { left: { style: BorderStyle.SINGLE, size: 12, color: 'CCCCCC', space: 8 } }
                : undefined,
            })
          );
        }
        i += 2;
        break;
      }

      case 'fence':
      case 'code_block': {
        if (isMermaidFence(t)) {
          const image = mermaid[mermaidIndex++];
          if (image && image.png && image.width > 0) {
            // PDF と同じ大きさに見えるよう、縦横比を保ったまま本文幅 (× mermaid.maxWidth) と
            // 実寸 × 拡大率の上限の小さい方に合わせる。
            // 縦長の図はページからあふれるので、本文の高さでも抑える
            const box = bodyBoxPx(cfg);
            let width = Math.round(
              Math.min((box.width * cfg.mermaid.maxWidth) / 100, image.width * MERMAID_MAX_SCALE)
            );
            let height = Math.round((image.height / image.width) * width);
            if (height > box.height) {
              width = Math.round((image.width / image.height) * box.height);
              height = box.height;
            }
            out.push(
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 120, after: 120, ...AUTO_LINE },
                children: [
                  new ImageRun({
                    type: 'png',
                    data: image.png,
                    transformation: { width, height },
                  }),
                ],
              })
            );
            break;
          }
          // 図にできなかったときは、下のコードブロックとしてそのまま出す
        }
        out.push(
          new Paragraph({
            children: t.content
              .replace(/\n$/, '')
              .split('\n')
              .flatMap((line, idx) =>
                idx === 0
                  ? [new TextRun({ text: line, font: firstFont(cfg.font.mono), size: 18 })]
                  : [new TextRun({ text: line, font: firstFont(cfg.font.mono), size: 18, break: 1 })]
              ),
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F7F7F7' },
            spacing: { before: 120, after: 120, ...exactLine(SMALL_TEXT_PT, cfg.font.lineHeight) },
          })
        );
        break;
      }

      case 'bullet_list_open':
        listDepth++;
        ordered = false;
        break;
      case 'ordered_list_open':
        listDepth++;
        ordered = true;
        break;
      case 'bullet_list_close':
      case 'ordered_list_close':
        listDepth--;
        break;

      case 'blockquote_open':
        quote = true;
        break;
      case 'blockquote_close':
        quote = false;
        break;

      case 'table_open': {
        const { table, next } = buildTable(tokens, i, cfg, images);
        out.push(table);
        // 表の後ろの空の段落は、表と表が続くときに 1 つにつながらないためのもの。
        // 直後が章頭で改ページする見出し (または文書の終わり) のときは入れない。
        // 表がページの下端で終わると、この段落だけが次ページへはみ出して白紙ページになるため
        const after = tokens[next + 1];
        const pageBreakNext =
          !after ||
          (after.type === 'heading_open' && Number(after.tag.slice(1)) <= cfg.heading.pageBreakLevel);
        if (!pageBreakNext) {
          out.push(new Paragraph({ text: '', spacing: { after: 120 } }));
        }
        i = next;
        break;
      }

      case 'hr':
        out.push(
          new Paragraph({
            text: '',
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999', space: 4 } },
          })
        );
        break;
    }
  }

  return out;
}

/** 表紙の段落を作る */
function buildCoverChildren(
  input: ExportInput,
  cfg: ExportConfig,
  stamp: StampImage | undefined
): Paragraph[] {
  const m = input.meta;
  // 表紙に出す項目が 1 つも無ければ表紙を作らない (PDF 側 template.ts buildCover と同じ判定)。
  // これを省くと、下の空行だけの表紙セクションができて 1 ページ目が真っ白になる
  if (!m.title && !m.docno && !m.classification) {
    return [];
  }
  const headingFont = firstFont(cfg.font.heading);
  const stampColor = toDocxColor(cfg.stamp.color);
  const children: Paragraph[] = [];

  if (m.docno) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [new TextRun({ text: m.docno, size: 20, font: headingFont })],
      })
    );
  }

  if (m.classification) {
    if (stamp) {
      // PDF と同じ見た目にするため、傾けた画像として貼る。
      // 画像なら Word でも回転指定が効く
      const heightPt = 34;
      const widthPt = Math.round((stamp.width / stamp.height) * heightPt);
      children.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new ImageRun({
              type: 'png',
              data: stamp.png,
              transformation: {
                width: widthPt,
                height: heightPt,
                rotation: cfg.stamp.rotate,
              },
            }),
          ],
        })
      );
    } else {
      // 画像化に失敗した場合の代替。赤枠のテキスト (傾きなし)
      children.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          indent: { left: 7000 },
          children: [
            new TextRun({
              text: `　${m.classification}　`,
              bold: true,
              size: 32,
              color: stampColor,
              font: headingFont,
            }),
          ],
          border: {
            top: { style: BorderStyle.SINGLE, size: 18, color: stampColor, space: 2 },
            bottom: { style: BorderStyle.SINGLE, size: 18, color: stampColor, space: 2 },
            left: { style: BorderStyle.SINGLE, size: 18, color: stampColor, space: 2 },
            right: { style: BorderStyle.SINGLE, size: 18, color: stampColor, space: 2 },
          },
        })
      );
    }
  }

  children.push(new Paragraph({ text: '', spacing: { before: 3600 } }));

  if (m.title) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: m.title, bold: true, size: 48, font: headingFont })],
      })
    );
  }
  if (m.subtitle) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 300 },
        children: [new TextRun({ text: m.subtitle, size: 28 })],
      })
    );
  }
  if (m.author) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 1200 },
        children: [new TextRun({ text: m.author, size: 22 })],
      })
    );
  }
  if (m.date) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: m.date, size: 22 })],
      })
    );
  }

  return children;
}

/** ページ枠の指定。無効なら undefined を返してプロパティ自体を出さない */
function borderOptions(enabled: boolean, cfg: ExportConfig) {
  if (!enabled) {
    return undefined;
  }
  const border = {
    style: BorderStyle.SINGLE,
    size: 12,
    color: toDocxColor(cfg.frame.color),
    space: 24,
  };
  return {
    pageBorderTop: border,
    pageBorderBottom: border,
    pageBorderLeft: border,
    pageBorderRight: border,
  };
}

/** Word 文書を生成する。図にできなかった Mermaid の理由は notes に追加する */
export async function renderDocx(
  input: ExportInput,
  cfg: ExportConfig,
  notes: string[] = []
): Promise<Buffer> {
  const md = new MarkdownIt({ html: false, linkify: true });
  const tokens = md.parse(input.markdown, {});

  // Word は図を描けないため、PDF と同じブラウザで描いた PNG を貼る
  const mermaid = cfg.mermaid.enabled
    ? await renderMermaid(tokens.filter(isMermaidFence).map((t) => t.content), cfg, true)
    : [];
  for (const reason of new Set(mermaid.filter((m) => !m.png).map((m) => m.error || 'unknown'))) {
    notes.push(translate('A Mermaid diagram could not be drawn and was kept as code: {0}', reason));
  }

  const images: ImageContext = { baseDir: path.dirname(input.sourcePath), failed: new Set() };
  const tocEntries: TocEntry[] = [];
  const bodyChildren = tokensToDocx(tokens, cfg, mermaid, images, tocEntries);
  for (const reason of images.failed) {
    notes.push(translate('An image could not be embedded and its description was kept as text: {0}', reason));
  }

  const bodyFont = firstFont(cfg.font.body);
  const headingFont = firstFont(cfg.font.heading);
  const accent = toDocxColor(cfg.heading.accentColor);
  const headingColor = toDocxColor(cfg.heading.textColor);
  const margin = toTwip(cfg.page.margin);

  const paper = paperTwipUpright(cfg);
  const pageSetup = {
    margin: { top: margin, bottom: margin, left: margin, right: margin },
    size: { width: paper.width, height: paper.height, orientation: cfg.page.orientation },
  };

  const footer =
    cfg.pageNumber.enabled
      ? {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ children: [PageNumber.CURRENT], font: headingFont, size: 18 })],
              }),
            ],
          }),
        }
      : undefined;

  const sections: ISectionOptions[] = [];

  // 表紙: ページ番号なし・ページ数に数えない
  // スタンプは PDF と同じ見た目にするため画像化する
  const stamp =
    cfg.cover.enabled && input.meta.classification
      ? await renderStamp(input.meta.classification, cfg)
      : undefined;
  const coverChildren = cfg.cover.enabled ? buildCoverChildren(input, cfg, stamp) : [];
  if (coverChildren.length > 0) {
    sections.push({
      properties: { page: { ...pageSetup, borders: borderOptions(cfg.frame.cover, cfg) } },
      children: coverChildren,
    });
  }

  // 目次: ページ番号なし
  if (cfg.toc.enabled && input.headings.length > 0) {
    sections.push({
      properties: {
        type: 'nextPage',
        page: { ...pageSetup, borders: borderOptions(cfg.frame.toc, cfg) },
      },
      children: [
        new Paragraph({
          spacing: { after: 300 },
          children: [new TextRun({ text: cfg.toc.title, bold: true, size: 36, font: headingFont })],
        }),
        // 目次の項目 (見出しとリンク) は最初から入れておき、ページ番号だけを Word の更新に任せる。
        // 「開いたら更新する」印 (w:dirty / updateFields) は付けない。開いたときに Word が自動で
        // 更新しても文書の変更とは扱われず、保存しても印が残って毎回確認が出るため。
        // ページ番号は利用者が Ctrl + A → F9 で入れる。この更新は変更として扱われ、保存される
        new TableOfContents(cfg.toc.title, {
          hyperlink: true,
          headingStyleRange: `1-${cfg.toc.depth}`,
          beginDirty: false,
          cachedEntries: tocEntries,
        }),
      ],
    } as ISectionOptions);
  }

  // 本文: ページ番号を 1 から
  sections.push({
    properties: {
      type: sections.length > 0 ? 'nextPage' : undefined,
      page: {
        ...pageSetup,
        borders: borderOptions(cfg.frame.body, cfg),
        pageNumbers: { start: 1 },
      },
    },
    footers: footer,
    children: bodyChildren,
  } as ISectionOptions);

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'mf-ordered',
          levels: [0, 1, 2].map((level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    styles: {
      default: {
        document: {
          run: { font: { ascii: bodyFont, eastAsia: bodyFont }, size: toHalfPoints(cfg.font.size) },
          // PDF の pre, blockquote { orphans: 2; widows: 2 } と同じ意図。
          // 段落がページの境目で分かれるとき、1 行だけ取り残さない (指定しないと Word は制御しない)。
          // docx は widowControl を出力するが、スタイル側の型に宣言が無いため型を広げて渡す
          paragraph: {
            spacing: { line: Math.round(cfg.font.lineHeight * 240) },
            widowControl: true,
          } as IParagraphStylePropertiesOptions,
        },
      },
      paragraphStyles: [
        // 見出しは PDF の h1〜h6 { line-height: 1.35 } に合わせた固定値にする
        ...buildHeadingStyles(cfg, headingFont, accent, headingColor).map((style) => ({
          ...style,
          paragraph: {
            ...style.paragraph,
            spacing: { ...style.paragraph?.spacing, ...exactLine(style.run.size / 2, 1.35) },
          },
        })),
        {
          id: 'MfTableText',
          name: 'Table Text',
          basedOn: 'Normal',
          quickFormat: true,
          run: { size: SMALL_TEXT_PT * 2 },
          paragraph: { spacing: exactLine(SMALL_TEXT_PT, cfg.font.lineHeight) },
        },
      ],
    },
    sections,
  });

  return Packer.toBuffer(doc);
}

/** 見出しの装飾プリセットを docx のスタイルに読み替える */
function buildHeadingStyles(
  cfg: ExportConfig,
  headingFont: string,
  accent: string,
  headingColor: string
) {
  const common = { basedOn: 'Normal', next: 'Normal', quickFormat: true };

  if (cfg.heading.style === 'band') {
    return [
      {
        id: 'Heading1',
        name: 'Heading 1',
        ...common,
        run: { size: 28, bold: true, color: 'FFFFFF', font: { ascii: headingFont, eastAsia: headingFont } },
        paragraph: {
          spacing: { before: 360, after: 200 },
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: accent },
          indent: { left: 120 },
        },
      },
      {
        id: 'Heading2',
        name: 'Heading 2',
        ...common,
        run: { size: 24, bold: true, color: headingColor, font: { ascii: headingFont, eastAsia: headingFont } },
        paragraph: {
          spacing: { before: 300, after: 140 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: '333333', space: 4 } },
        },
      },
      {
        id: 'Heading3',
        name: 'Heading 3',
        ...common,
        run: { size: 22, bold: true, color: headingColor, font: { ascii: headingFont, eastAsia: headingFont } },
        paragraph: { spacing: { before: 240, after: 120 } },
      },
    ];
  }

  if (cfg.heading.style === 'underline') {
    return [
      {
        id: 'Heading1',
        name: 'Heading 1',
        ...common,
        run: { size: 30, bold: true, color: headingColor, font: { ascii: headingFont, eastAsia: headingFont } },
        paragraph: {
          spacing: { before: 360, after: 200 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: accent, space: 4 } },
        },
      },
      {
        id: 'Heading2',
        name: 'Heading 2',
        ...common,
        run: { size: 24, bold: true, color: headingColor, font: { ascii: headingFont, eastAsia: headingFont } },
        paragraph: {
          spacing: { before: 300, after: 140 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '666666', space: 4 } },
        },
      },
    ];
  }

  return [
    {
      id: 'Heading1',
      name: 'Heading 1',
      ...common,
      run: { size: 30, bold: true, font: { ascii: headingFont, eastAsia: headingFont } },
      paragraph: { spacing: { before: 360, after: 200 } },
    },
    {
      id: 'Heading2',
      name: 'Heading 2',
      ...common,
      run: { size: 24, bold: true, font: { ascii: headingFont, eastAsia: headingFont } },
      paragraph: { spacing: { before: 300, after: 140 } },
    },
  ];
}
