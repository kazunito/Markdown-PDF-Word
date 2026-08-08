/**
 * 拡張の起動 (activate) とコマンド登録を、VSCode を立ち上げずに検証する。
 * vscode モジュールをスタブに差し替えて out/extension.js を読み込む。
 *
 * 使い方: node verify/activate-test.js
 */
const Module = require('module');
const path = require('path');

const registered = [];
const subscriptions = [];

/** VSCode API の最小限のスタブ */
const vscodeStub = {
  window: {
    createOutputChannel: (name) => ({
      name,
      appendLine: () => {},
      show: () => {},
      dispose: () => {},
    }),
    showErrorMessage: async () => undefined,
    showInformationMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showInputBox: async () => undefined,
    showOpenDialog: async () => undefined,
    withProgress: (_opts, task) => task(),
    activeTextEditor: undefined,
  },
  commands: {
    registerCommand: (id, handler) => {
      registered.push(id);
      return { dispose: () => {} };
    },
    executeCommand: () => {},
  },
  workspace: {
    getConfiguration: () => ({ get: () => undefined }),
  },
  Uri: { file: (p) => ({ fsPath: p }) },
  ProgressLocation: { Notification: 15 },
};

// require('vscode') をスタブに差し替える
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === 'vscode') {
    return 'vscode';
  }
  return originalResolve.call(this, request, ...args);
};
require.cache['vscode'] = { id: 'vscode', filename: 'vscode', loaded: true, exports: vscodeStub };

const extension = require(path.join(__dirname, '..', 'out', 'extension.js'));

const context = {
  subscriptions,
  secrets: {
    get: async () => undefined,
    store: async () => undefined,
    delete: async () => undefined,
  },
};

try {
  extension.activate(context);
} catch (e) {
  console.error('activate に失敗:', e.message);
  process.exit(1);
}

// package.json に宣言したコマンドがすべて登録されているか突き合わせる
const manifest = require(path.join(__dirname, '..', 'package.json'));
const declared = manifest.contributes.commands.map((c) => c.command);
const missing = declared.filter((c) => !registered.includes(c));
const extra = registered.filter((c) => !declared.includes(c));

console.log('activate: 成功');
console.log('登録されたコマンド:', registered.length, '件');
console.log('マニフェスト宣言   :', declared.length, '件');
console.log('未登録             :', missing.length ? missing.join(', ') : 'なし');
console.log('宣言漏れ           :', extra.length ? extra.join(', ') : 'なし');
console.log('subscriptions      :', subscriptions.length, '件');

if (missing.length > 0 || extra.length > 0) {
  process.exit(1);
}

extension.deactivate();
console.log('deactivate: 成功');
