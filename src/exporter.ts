import * as fs from 'fs';
import * as path from 'path';
import { renderDocx } from './docx';
import { t } from './i18n';
import { sha256Line } from './hash';
import { MERMAID_PLACEHOLDER, parseMarkdown, renderBody } from './markdown';
import { renderMermaid } from './mermaid';
import { restrictPdf, signPdf } from './protect';
import { renderPdf } from './render';
import { buildHtml } from './template';
import { ExportConfig, ExportInput } from './types';

/**
 * 変換の中心。Markdown は読み取るだけで書き換えない。
 */

export interface SecretProvider {
  /** 編集制限に使うオーナーパスワードを取得する */
  getOwnerPassword(): PromiseLike<string | undefined>;
  /** 署名用証明書のパスフレーズを取得する */
  getCertPassphrase(): PromiseLike<string | undefined>;
}

export interface ExportResult {
  outputPath: string;
  hashPath?: string;
  notes: string[];
}

/** 出力先パスを決める */
function resolveOutputPath(sourcePath: string, cfg: ExportConfig, ext: string): string {
  const base = path.basename(sourcePath, path.extname(sourcePath)) + ext;
  const dir = cfg.outputDirectory
    ? path.isAbsolute(cfg.outputDirectory)
      ? cfg.outputDirectory
      : path.join(path.dirname(sourcePath), cfg.outputDirectory)
    : path.dirname(sourcePath);

  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, base);
}

/** Markdown ファイルを読んで解析する。diagrams には Mermaid のコードが出現順に入る */
export function loadInput(sourcePath: string): {
  input: ExportInput;
  bodyHtml: string;
  diagrams: string[];
} {
  const raw = fs.readFileSync(sourcePath, 'utf8');
  const input = parseMarkdown(sourcePath, raw);
  const { html, headings, diagrams } = renderBody(input.markdown);
  input.headings = headings;
  return { input, bodyHtml: html, diagrams };
}

/** HTML に埋め込む文字列を安全にする */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 本文 HTML の Mermaid の目印を図 (SVG) に差し替える。
 * 描けなかった図はコードブロックのまま出し、理由を notes に残す。
 */
async function embedMermaid(
  bodyHtml: string,
  diagrams: string[],
  cfg: ExportConfig,
  notes: string[]
): Promise<string> {
  const placeholder = new RegExp(
    `<figure class="mermaid-figure" ${MERMAID_PLACEHOLDER}="(\\d+)"></figure>`,
    'g'
  );

  const asCode = (index: number): string =>
    `<pre><code class="language-mermaid">${escapeHtml(diagrams[index] || '')}</code></pre>`;

  if (diagrams.length === 0) {
    return bodyHtml;
  }
  if (!cfg.mermaid.enabled) {
    return bodyHtml.replace(placeholder, (_m, n: string) => asCode(Number(n)));
  }

  const images = await renderMermaid(diagrams, cfg, false);
  const failed = new Set<string>();

  const html = bodyHtml.replace(placeholder, (_m, n: string) => {
    const index = Number(n);
    const image = images[index];
    if (!image || !image.svg) {
      failed.add(image?.error || 'unknown error');
      return asCode(index);
    }
    return `<figure class="mermaid-figure">${image.svg}</figure>`;
  });

  for (const reason of failed) {
    notes.push(t('A Mermaid diagram could not be drawn and was kept as code: {0}', reason));
  }
  return groupHeadingWithFigure(html, cfg.heading.pageBreakLevel);
}

/**
 * 見出しと、その直後の図を 1 つの塊にする。
 *
 * Paged.js の break-after: avoid は、図が入りきらないときに見出しを引き連れない。
 * 見出しだけが前のページの末尾に残り、図が次のページの先頭に出る。
 * 塊にして break-inside: avoid を掛けると、2 つが必ず同じページへ移る (CSS は template.ts)。
 *
 * 章頭で改ページする見出しは対象外。塊にすると改ページの指定が効かなくなる。
 */
function groupHeadingWithFigure(html: string, pageBreakLevel: number): string {
  const headingWithFigure =
    /<h([1-6])([^>]*)>([\s\S]*?)<\/h\1>\s*(<figure class="mermaid-figure">[\s\S]*?<\/figure>)/g;
  return html.replace(headingWithFigure, (whole, level: string, attrs, text, figure) =>
    Number(level) <= pageBreakLevel
      ? whole
      : `<div class="figure-block"><h${level}${attrs}>${text}</h${level}>${figure}</div>`
  );
}

/** ハッシュファイルを書き出す */
function emitHash(buffer: Buffer, outputPath: string): string {
  const hashPath = `${outputPath}.sha256`;
  fs.writeFileSync(hashPath, sha256Line(buffer, outputPath), 'utf8');
  return hashPath;
}

/** PDF を出力する */
export async function exportPdf(
  sourcePath: string,
  cfg: ExportConfig,
  secrets: SecretProvider
): Promise<ExportResult> {
  const { input, bodyHtml, diagrams } = loadInput(sourcePath);
  const notes: string[] = [];

  const body = await embedMermaid(bodyHtml, diagrams, cfg, notes);

  let extraCss = '';
  if (cfg.customCss) {
    if (fs.existsSync(cfg.customCss)) {
      extraCss = fs.readFileSync(cfg.customCss, 'utf8');
    } else {
      notes.push(t('The extra CSS file was not found: {0}', cfg.customCss));
    }
  }

  const html = buildHtml(input, body, input.headings, cfg, extraCss);
  let pdf = await renderPdf(html, cfg);

  // 保護。restrict と sign は排他
  if (cfg.protection.mode === 'restrict') {
    const password = await secrets.getOwnerPassword();
    if (!password) {
      notes.push(
        t(
          'The edit restriction was not applied because no owner password is set. Store one with the command "Store the owner password".'
        )
      );
    } else {
      pdf = await restrictPdf(pdf, password, cfg);
      notes.push(
        t(
          'The edit restriction was applied. Note that permissions are only advisory to the viewer and do not prevent tampering.'
        )
      );
    }
  } else if (cfg.protection.mode === 'sign') {
    const passphrase = await secrets.getCertPassphrase();
    if (passphrase === undefined) {
      notes.push(
        t(
          'The digital signature was not applied because no certificate passphrase is set. Store one with the command "Store the certificate passphrase".'
        )
      );
    } else {
      pdf = await signPdf(pdf, passphrase, cfg);
      notes.push(
        t(
          'The digital signature was added. Detection depends on the viewer: Chrome cannot verify signatures, so Acrobat Reader is recommended.'
        )
      );
    }
  }

  const outputPath = resolveOutputPath(sourcePath, cfg, '.pdf');
  fs.writeFileSync(outputPath, pdf);

  const hashPath = cfg.hash.emit ? emitHash(pdf, outputPath) : undefined;
  return { outputPath, hashPath, notes };
}

/** Word を出力する */
export async function exportDocx(sourcePath: string, cfg: ExportConfig): Promise<ExportResult> {
  const { input } = loadInput(sourcePath);
  const notes: string[] = [];
  const buffer = await renderDocx(input, cfg, notes);

  const outputPath = resolveOutputPath(sourcePath, cfg, '.docx');
  fs.writeFileSync(outputPath, buffer);

  const hashPath = cfg.hash.emit ? emitHash(buffer, outputPath) : undefined;
  notes.push(t('Word output is an editable draft. Use the PDF as the authoritative copy.'));
  return { outputPath, hashPath, notes };
}
