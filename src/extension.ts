import * as fs from 'fs';
import * as vscode from 'vscode';
import { loadConfig } from './config';
import { exportDocx, exportPdf, ExportResult, SecretProvider } from './exporter';
import { sha256 } from './hash';
import { inspectPdf } from './protect';

/**
 * 拡張の入口。
 * 秘密情報 (オーナーパスワード・証明書パスフレーズ) は SecretStorage にのみ保存し、
 * settings.json には書かない。
 */

const SECRET_OWNER_PASSWORD = 'markdownFormal.ownerPassword';
const SECRET_CERT_PASSPHRASE = 'markdownFormal.certPassphrase';

let output: vscode.OutputChannel;

function log(message: string): void {
  output.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
}

/** 現在編集中の Markdown を取得する */
function activeMarkdownPath(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'markdown') {
    vscode.window.showErrorMessage('Markdown ファイルを開いた状態で実行してください。');
    return undefined;
  }
  if (editor.document.isUntitled) {
    vscode.window.showErrorMessage('先にファイルを保存してください。');
    return undefined;
  }
  return editor.document.uri.fsPath;
}

/** 変換結果を通知する */
async function reportResult(result: ExportResult): Promise<void> {
  for (const note of result.notes) {
    log(note);
  }
  if (result.hashPath) {
    log(`ハッシュ: ${result.hashPath}`);
  }
  log(`出力: ${result.outputPath}`);

  const choice = await vscode.window.showInformationMessage(
    `変換しました: ${result.outputPath}`,
    'フォルダを開く',
    'ログを見る'
  );
  if (choice === 'フォルダを開く') {
    vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(result.outputPath));
  } else if (choice === 'ログを見る') {
    output.show();
  }
}

/** 例外をユーザーに見える形で報告する */
function reportError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  log(`エラー: ${message}`);
  vscode.window.showErrorMessage(`変換に失敗しました: ${message}`, 'ログを見る').then((c) => {
    if (c === 'ログを見る') {
      output.show();
    }
  });
}

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel('Markdown Formal');
  context.subscriptions.push(output);

  const secrets: SecretProvider = {
    getOwnerPassword: () => context.secrets.get(SECRET_OWNER_PASSWORD),
    getCertPassphrase: () => context.secrets.get(SECRET_CERT_PASSPHRASE),
  };

  const withProgress = <T>(title: string, task: () => Promise<T>) =>
    vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title, cancellable: false },
      task
    );

  context.subscriptions.push(
    vscode.commands.registerCommand('markdownFormal.exportPdf', async () => {
      const sourcePath = activeMarkdownPath();
      if (!sourcePath) {
        return;
      }
      try {
        const cfg = loadConfig(vscode.Uri.file(sourcePath));
        const result = await withProgress('PDF に変換しています…', () =>
          exportPdf(sourcePath, cfg, secrets)
        );
        await reportResult(result);
      } catch (e) {
        reportError(e);
      }
    }),

    vscode.commands.registerCommand('markdownFormal.exportDocx', async () => {
      const sourcePath = activeMarkdownPath();
      if (!sourcePath) {
        return;
      }
      try {
        const cfg = loadConfig(vscode.Uri.file(sourcePath));
        if (!cfg.docx.enabled) {
          vscode.window.showWarningMessage('Word 出力は設定で無効になっています。');
          return;
        }
        const result = await withProgress('Word に変換しています…', () =>
          exportDocx(sourcePath, cfg)
        );
        await reportResult(result);
      } catch (e) {
        reportError(e);
      }
    }),

    vscode.commands.registerCommand('markdownFormal.exportBoth', async () => {
      const sourcePath = activeMarkdownPath();
      if (!sourcePath) {
        return;
      }
      try {
        const cfg = loadConfig(vscode.Uri.file(sourcePath));
        const pdfResult = await withProgress('PDF に変換しています…', () =>
          exportPdf(sourcePath, cfg, secrets)
        );
        for (const note of pdfResult.notes) {
          log(note);
        }
        log(`出力: ${pdfResult.outputPath}`);

        if (cfg.docx.enabled) {
          const docxResult = await withProgress('Word に変換しています…', () =>
            exportDocx(sourcePath, cfg)
          );
          for (const note of docxResult.notes) {
            log(note);
          }
          log(`出力: ${docxResult.outputPath}`);
        }
        vscode.window.showInformationMessage('PDF と Word を出力しました。', 'ログを見る').then((c) => {
          if (c === 'ログを見る') {
            output.show();
          }
        });
      } catch (e) {
        reportError(e);
      }
    }),

    vscode.commands.registerCommand('markdownFormal.setOwnerPassword', async () => {
      const value = await vscode.window.showInputBox({
        prompt: 'PDF のオーナーパスワード (編集制限の解除に使う管理者用パスワード)',
        password: true,
        ignoreFocusOut: true,
      });
      if (value === undefined) {
        return;
      }
      await context.secrets.store(SECRET_OWNER_PASSWORD, value);
      vscode.window.showInformationMessage('オーナーパスワードを SecretStorage に保存しました。');
    }),

    vscode.commands.registerCommand('markdownFormal.setCertPassphrase', async () => {
      const value = await vscode.window.showInputBox({
        prompt: '署名用証明書 (.p12 / .pfx) のパスフレーズ',
        password: true,
        ignoreFocusOut: true,
      });
      if (value === undefined) {
        return;
      }
      await context.secrets.store(SECRET_CERT_PASSPHRASE, value);
      vscode.window.showInformationMessage('証明書パスフレーズを SecretStorage に保存しました。');
    }),

    vscode.commands.registerCommand('markdownFormal.clearSecrets', async () => {
      const ok = await vscode.window.showWarningMessage(
        '保存済みのオーナーパスワードと証明書パスフレーズを削除します。よろしいですか?',
        { modal: true },
        '削除する'
      );
      if (ok !== '削除する') {
        return;
      }
      await context.secrets.delete(SECRET_OWNER_PASSWORD);
      await context.secrets.delete(SECRET_CERT_PASSPHRASE);
      vscode.window.showInformationMessage('保存した秘密情報を削除しました。');
    }),

    vscode.commands.registerCommand('markdownFormal.verifyPdf', async () => {
      const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { PDF: ['pdf'] },
        openLabel: '検証する PDF を選択',
      });
      if (!picked || picked.length === 0) {
        return;
      }
      try {
        const filePath = picked[0].fsPath;
        const bytes = fs.readFileSync(filePath);
        const info = await inspectPdf(bytes);
        const digest = sha256(bytes);

        output.show();
        log(`検証: ${filePath}`);
        log(`  ページ数     : ${info.pages}`);
        log(`  編集制限     : ${info.encrypted ? 'あり' : 'なし'}`);
        log(`  電子署名     : ${info.signed ? 'あり' : 'なし'}`);
        log(`  SHA-256      : ${digest}`);
        log('  ※ 台帳の値と一致すれば改ざんされていません。');
        if (info.signed) {
          log('  ※ 署名の有効性は Acrobat Reader か pdfsig で確認してください。');
        }
      } catch (e) {
        reportError(e);
      }
    })
  );
}

export function deactivate(): void {
  // 後始末は不要
}
