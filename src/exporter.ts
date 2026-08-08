import * as fs from 'fs';
import * as path from 'path';
import { renderDocx } from './docx';
import { t } from './i18n';
import { sha256Line } from './hash';
import { parseMarkdown, renderBody } from './markdown';
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

/** Markdown ファイルを読んで解析する */
export function loadInput(sourcePath: string): { input: ExportInput; bodyHtml: string } {
  const raw = fs.readFileSync(sourcePath, 'utf8');
  const input = parseMarkdown(sourcePath, raw);
  const { html, headings } = renderBody(input.markdown);
  input.headings = headings;
  return { input, bodyHtml: html };
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
  const { input, bodyHtml } = loadInput(sourcePath);
  const notes: string[] = [];

  let extraCss = '';
  if (cfg.customCss) {
    if (fs.existsSync(cfg.customCss)) {
      extraCss = fs.readFileSync(cfg.customCss, 'utf8');
    } else {
      notes.push(t('The extra CSS file was not found: {0}', cfg.customCss));
    }
  }

  const html = buildHtml(input, bodyHtml, input.headings, cfg, extraCss);
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
  const buffer = await renderDocx(input, cfg);

  const outputPath = resolveOutputPath(sourcePath, cfg, '.docx');
  fs.writeFileSync(outputPath, buffer);

  const hashPath = cfg.hash.emit ? emitHash(buffer, outputPath) : undefined;
  return {
    outputPath,
    hashPath,
    notes: [t('Word output is an editable draft. Use the PDF as the authoritative copy.')],
  };
}
