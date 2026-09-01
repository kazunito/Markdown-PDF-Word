/**
 * VSCode を起動せずに変換処理を通しで動かす確認用ハーネス。
 * 拡張本体には含まれない (out/ をそのまま呼ぶだけ)。
 *
 * 使い方:
 *   node verify/run-local.js samples/sample.md
 */
const path = require('path');
const { exportPdf, exportDocx } = require('../out/exporter');

/** VSCode 設定の既定値と同じ内容を手で組み立てる */
const cfg = {
  outputDirectory: path.join(__dirname, 'out'),
  page: { format: 'A4', orientation: 'portrait', margin: '18mm' },
  frame: {
    // MF_FRAME=on で全ページ枠あり、off で枠なし。既定は表紙のみ枠なし
    cover: process.env.MF_FRAME === 'on',
    toc: process.env.MF_FRAME !== 'off',
    body: process.env.MF_FRAME !== 'off',
    color: '#444444',
    width: '0.6mm',
    padding: '5mm',
  },
  font: {
    body: '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif CJK JP", serif',
    heading: '"Hiragino Sans", "Yu Gothic", "Noto Sans CJK JP", sans-serif',
    mono: '"Menlo", "Consolas", monospace',
    size: '10.5pt',
    lineHeight: 1.75,
  },
  heading: {
    // MF_HEADING_STYLE で plain / band / underline を切り替えて確認できる
    style: process.env.MF_HEADING_STYLE || 'band',
    accentColor: '#4472C4',
    textColor: '#2E74B5',
    pageBreakLevel: 2,
  },
  cover: { enabled: true },
  stamp: { color: '#CC0000', rotate: -8 },
  // 既定値は英語。日本語の文書を作るときは設定 markdownFormal.toc.title を変える
  toc: { enabled: true, depth: 3, title: 'Contents' },
  pageNumber: { enabled: true, position: 'bottom-center' },
  outline: { enabled: true },
  protection: {
    mode: process.env.MF_PROTECTION || 'restrict',
    permissions: { printing: 'highResolution', copying: true, annotating: false },
  },
  signing: {
    certificatePath: process.env.MF_CERT || '',
    reason: '正式文書として承認',
    location: 'Tokyo',
    contactInfo: 'infra@example.co.jp',
  },
  hash: { emit: true },
  browser: { executablePath: process.env.MF_BROWSER || '' },
  docx: { enabled: true },
  customCss: '',
};

/** SecretStorage の代わりに環境変数から読む */
const secrets = {
  getOwnerPassword: async () => process.env.MF_OWNER_PASSWORD || undefined,
  getCertPassphrase: async () => process.env.MF_CERT_PASSPHRASE,
};

(async () => {
  const source = path.resolve(process.argv[2] || 'samples/sample.md');

  const pdf = await exportPdf(source, cfg, secrets);
  console.log('PDF :', pdf.outputPath);
  pdf.notes.forEach((n) => console.log('  -', n));

  const docx = await exportDocx(source, cfg);
  console.log('Word:', docx.outputPath);
  docx.notes.forEach((n) => console.log('  -', n));

  process.exit(0);
})().catch((e) => {
  console.error('失敗:', e.message);
  process.exit(1);
});
