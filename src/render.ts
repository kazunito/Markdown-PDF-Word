import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveBrowserPath } from './browser';
import { ExportConfig } from './types';

/**
 * HTML を PDF にする。
 * Paged.js が組版 (改ページ・ページ番号・目次のページ番号) を行い、
 * Chrome / Edge が印刷する。
 *
 * 注意: Chrome の --print-to-pdf に Paged.js を読ませても分割されない。
 * Puppeteer 経由で Paged.js の描画完了を待つ必要があるため、
 * 検証済みの pagedjs-cli の Printer を利用する。
 */

/** 一時作業ディレクトリを作る。呼び出し側で必ず削除する */
function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-formal-'));
}

export async function renderPdf(html: string, cfg: ExportConfig): Promise<Buffer> {
  const browserPath = resolveBrowserPath(cfg.browser.executablePath);

  // pagedjs-cli は内部の puppeteer が環境変数で実行ファイルを決める。
  // 既存の Chrome / Edge を使うため、Chromium の追加ダウンロードは発生しない。
  process.env['PUPPETEER_EXECUTABLE_PATH'] = browserPath;
  process.env['PUPPETEER_SKIP_DOWNLOAD'] = 'true';

  const workDir = makeTempDir();
  const htmlPath = path.join(workDir, 'document.html');
  fs.writeFileSync(htmlPath, html, 'utf8');

  try {
    // pagedjs-cli は ESM/CJS 両対応。default に Printer が入る
    const mod = require('pagedjs-cli');
    const Printer = mod.default || mod;

    const printer = new Printer({
      allowLocal: true,
      allowRemote: false,
      timeout: 120000,
    });

    const options: Record<string, unknown> = {};
    if (cfg.outline.enabled) {
      // 見出しから PDF のしおり (アウトライン) を作る
      options['outlineTags'] = ['h1', 'h2', 'h3'];
    }

    const result = await printer.pdf(htmlPath, options);
    return Buffer.isBuffer(result) ? result : Buffer.from(result);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}
