import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  ImageRun,
  ISectionOptions,
  LevelFormat,
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
// トークン変数 t と紛れないよう別名で受ける
import { t as translate } from './i18n';
import Token from 'markdown-it/lib/token.mjs';
import { MermaidImage, renderMermaid } from './mermaid';
import { groupedFigureHeightLimitMm, paperTwip, paperTwipUpright } from './paper';
import { renderStamp, StampImage } from './stamp';
import { ExportConfig, ExportInput } from './types';

/**
 * Word (docx) 出力。
 * PDF とは別の描画経路で、CSS は使えないため docx の指定に読み替える。
 * 位置づけは編集用ドラフト。正本は PDF。
 */

/**
 * 生成した docx を後処理する。
 *
 * 目的: Word を開くたびに出る
 * 「この文書には他のファイルを参照するフィールドが含まれています…」の確認を出さずに、
 * 目次だけを初回に確定させる。
 *
 * 方法: 文書全体の <w:updateFields/> を外し、代わりに目次フィールドに
 * w:dirty="true" を付ける。フィールド単位の更新指示なので確認ダイアログが出ない。
 */
async function postProcessDocx(buffer: Buffer): Promise<Buffer> {
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(buffer);

  const settingsFile = zip.file('word/settings.xml');
  if (settingsFile) {
    const settings = await settingsFile.async('string');
    zip.file('word/settings.xml', settings.replace(/<w:updateFields[^>]*\/>/g, ''));
  }

  const documentFile = zip.file('word/document.xml');
  if (documentFile) {
    const document = await documentFile.async('string');
    // 目次フィールドの開始位置だけを dirty にする
    const tocIndex = document.indexOf('TOC \\');
    if (tocIndex >= 0) {
      const beginIndex = document.lastIndexOf('<w:fldChar w:fldCharType="begin"', tocIndex);
      if (beginIndex >= 0) {
        const endOfTag = document.indexOf('/>', beginIndex);
        const alreadyDirty = document.slice(beginIndex, endOfTag).includes('w:dirty');
        if (endOfTag > beginIndex && !alreadyDirty) {
          const patched =
            document.slice(0, endOfTag) + ' w:dirty="true"' + document.slice(endOfTag);
          zip.file('word/document.xml', patched);
        }
      }
    }
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

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
function inlineToRuns(token: Token | undefined, cfg: ExportConfig): ParagraphChild[] {
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
function buildTable(tokens: Token[], start: number, cfg: ExportConfig): { table: Table; next: number } {
  const rows: TableRow[] = [];
  let cells: TableCell[] = [];
  let isHeader = false;
  let i = start + 1;

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
        rows.push(new TableRow({ children: cells, tableHeader: isHeader }));
        break;
      case 'th_open':
      case 'td_open': {
        const inline = tokens[i + 1];
        cells.push(
          new TableCell({
            children: [
              new Paragraph({
                children: inlineToRuns(inline, cfg).map((r) =>
                  r instanceof TextRun && isHeader ? r : r
                ),
                spacing: { before: 20, after: 20 },
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
function tokensToDocx(
  tokens: Token[],
  cfg: ExportConfig,
  mermaid: MermaidImage[] = []
): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  let listDepth = -1;
  let ordered = false;
  let quote = false;
  let mermaidIndex = 0;

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
            children: inlineToRuns(inline, cfg),
          })
        );
        i += 2;
        break;
      }

      case 'paragraph_open': {
        const inline = tokens[i + 1];
        if (listDepth >= 0) {
          out.push(
            new Paragraph({
              children: inlineToRuns(inline, cfg),
              ...(ordered
                ? { numbering: { reference: 'mf-ordered', level: listDepth } }
                : { bullet: { level: listDepth } }),
            })
          );
        } else {
          out.push(
            new Paragraph({
              children: inlineToRuns(inline, cfg),
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
            // PDF 側は SVG が本文幅いっぱいに広がる。Word でも同じ大きさに見えるよう、
            // 縦横比を保ったまま本文幅 (× mermaid.maxWidth) に合わせる。
            // 縦長の図はページからあふれるので、本文の高さでも抑える
            const box = bodyBoxPx(cfg);
            let width = Math.round((box.width * cfg.mermaid.maxWidth) / 100);
            let height = Math.round((image.height / image.width) * width);
            if (height > box.height) {
              width = Math.round((image.width / image.height) * box.height);
              height = box.height;
            }
            out.push(
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 120, after: 120 },
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
            spacing: { before: 120, after: 120 },
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
        const { table, next } = buildTable(tokens, i, cfg);
        out.push(table);
        out.push(new Paragraph({ text: '', spacing: { after: 120 } }));
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

  const bodyChildren = tokensToDocx(tokens, cfg, mermaid);

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
        new TableOfContents(cfg.toc.title, {
          hyperlink: true,
          headingStyleRange: `1-${cfg.toc.depth}`,
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
    // ここで true にしておき、後処理でフィールド単位の dirty に置き換える。
    // 文書全体の updateFields のままだと Word が開くたびに確認ダイアログを出す。
    features: { updateFields: true },
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
          paragraph: { spacing: { line: Math.round(cfg.font.lineHeight * 240) } },
        },
      },
      paragraphStyles: buildHeadingStyles(cfg, headingFont, accent, headingColor),
    },
    sections,
  });

  return postProcessDocx(await Packer.toBuffer(doc));
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
