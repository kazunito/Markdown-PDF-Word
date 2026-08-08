/**
 * 実行時の表示文言を翻訳する。
 *
 * 翻訳の元になる文字列は英語で書き、日本語訳は l10n/bundle.l10n.ja.json に置く。
 * exporter / browser / protect は VSCode を読み込まずに動かせる必要がある
 * (verify/run-local.js が out/exporter を直接呼ぶ) ため、vscode は遅延して解決し、
 * 解決できないときは英語のまま返す。
 */

/** `{0}` `{1}` … を引数で置き換える。VSCode の l10n.t と同じ書式 */
function fill(message: string, args: (string | number)[]): string {
  return args.reduce<string>(
    (text, value, index) => text.split(`{${index}}`).join(String(value)),
    message
  );
}

export function t(message: string, ...args: (string | number)[]): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vscode = require('vscode');
    return vscode.l10n.t(message, ...args);
  } catch {
    return fill(message, args);
  }
}
