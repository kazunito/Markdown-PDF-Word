/**
 * mermaid の実行ファイル 1 つだけを out/vendor/ に複製する。
 *
 * node_modules/mermaid は依存を含めると 80MB を超えるが、
 * 図を描くのに必要なのは自己完結した dist/mermaid.min.js だけ。
 * これを配布物に含めることで、VSIX に mermaid の依存一式を持ち込まずに済む。
 */
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'mermaid', 'dist', 'mermaid.min.js');
const destDir = path.join(__dirname, '..', 'out', 'vendor');
const dest = path.join(destDir, 'mermaid.min.js');

if (!fs.existsSync(src)) {
  console.error(`mermaid が見つかりません: ${src}\nnpm install を先に実行してください。`);
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log(`copied: ${dest} (${fs.statSync(dest).size} bytes)`);
