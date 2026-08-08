import * as fs from 'fs';
import * as vscode from 'vscode';
import { loadConfig } from './config';
import { exportDocx, exportPdf, ExportResult, SecretProvider } from './exporter';
import { sha256 } from './hash';
import { t } from './i18n';
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

/**
 * 対象の Markdown を決める。
 * エクスプローラーやタブの右クリックからは URI が渡されるのでそれを優先し、
 * コマンドパレットからの実行では編集中のファイルを使う。
 */
function targetMarkdownPath(resource?: vscode.Uri): string | undefined {
  if (resource && resource.fsPath) {
    if (!resource.fsPath.toLowerCase().endsWith('.md')) {
      vscode.window.showErrorMessage(t('Select a Markdown file (.md).'));
      return undefined;
    }
    return resource.fsPath;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'markdown') {
    vscode.window.showErrorMessage(t('Open a Markdown file before running this command.'));
    return undefined;
  }
  if (editor.document.isUntitled) {
    vscode.window.showErrorMessage(t('Save the file first.'));
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
    log(t('Fingerprint: {0}', result.hashPath));
  }
  log(t('Output: {0}', result.outputPath));

  const openFolder = t('Open folder');
  const showLog = t('Show log');
  const choice = await vscode.window.showInformationMessage(
    t('Converted: {0}', result.outputPath),
    openFolder,
    showLog
  );
  if (choice === openFolder) {
    vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(result.outputPath));
  } else if (choice === showLog) {
    output.show();
  }
}

/** 例外をユーザーに見える形で報告する */
function reportError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const showLog = t('Show log');
  log(t('Error: {0}', message));
  vscode.window.showErrorMessage(t('Conversion failed: {0}', message), showLog).then((c) => {
    if (c === showLog) {
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
    vscode.commands.registerCommand('markdownFormal.exportPdf', async (resource?: vscode.Uri) => {
      const sourcePath = targetMarkdownPath(resource);
      if (!sourcePath) {
        return;
      }
      try {
        const cfg = loadConfig(vscode.Uri.file(sourcePath));
        const result = await withProgress(t('Converting to PDF\u2026'), () =>
          exportPdf(sourcePath, cfg, secrets)
        );
        await reportResult(result);
      } catch (e) {
        reportError(e);
      }
    }),

    vscode.commands.registerCommand('markdownFormal.exportDocx', async (resource?: vscode.Uri) => {
      const sourcePath = targetMarkdownPath(resource);
      if (!sourcePath) {
        return;
      }
      try {
        const cfg = loadConfig(vscode.Uri.file(sourcePath));
        if (!cfg.docx.enabled) {
          vscode.window.showWarningMessage(t('Word output is disabled in the settings.'));
          return;
        }
        const result = await withProgress(t('Converting to Word\u2026'), () =>
          exportDocx(sourcePath, cfg)
        );
        await reportResult(result);
      } catch (e) {
        reportError(e);
      }
    }),

    vscode.commands.registerCommand('markdownFormal.exportBoth', async (resource?: vscode.Uri) => {
      const sourcePath = targetMarkdownPath(resource);
      if (!sourcePath) {
        return;
      }
      try {
        const cfg = loadConfig(vscode.Uri.file(sourcePath));
        const pdfResult = await withProgress(t('Converting to PDF\u2026'), () =>
          exportPdf(sourcePath, cfg, secrets)
        );
        for (const note of pdfResult.notes) {
          log(note);
        }
        log(t('Output: {0}', pdfResult.outputPath));

        if (cfg.docx.enabled) {
          const docxResult = await withProgress(t('Converting to Word\u2026'), () =>
            exportDocx(sourcePath, cfg)
          );
          for (const note of docxResult.notes) {
            log(note);
          }
          log(t('Output: {0}', docxResult.outputPath));
        }
        const showLog = t('Show log');
        vscode.window.showInformationMessage(t('Wrote the PDF and the Word file.'), showLog).then((c) => {
          if (c === showLog) {
            output.show();
          }
        });
      } catch (e) {
        reportError(e);
      }
    }),

    vscode.commands.registerCommand('markdownFormal.setOwnerPassword', async () => {
      const value = await vscode.window.showInputBox({
        prompt: t('Owner password for the PDF (the administrator password that lifts the edit restriction)'),
        password: true,
        ignoreFocusOut: true,
      });
      if (value === undefined) {
        return;
      }
      await context.secrets.store(SECRET_OWNER_PASSWORD, value);
      vscode.window.showInformationMessage(t('Stored the owner password in SecretStorage.'));
    }),

    vscode.commands.registerCommand('markdownFormal.setCertPassphrase', async () => {
      const value = await vscode.window.showInputBox({
        prompt: t('Passphrase of the signing certificate (.p12 / .pfx)'),
        password: true,
        ignoreFocusOut: true,
      });
      if (value === undefined) {
        return;
      }
      await context.secrets.store(SECRET_CERT_PASSPHRASE, value);
      vscode.window.showInformationMessage(t('Stored the certificate passphrase in SecretStorage.'));
    }),

    vscode.commands.registerCommand('markdownFormal.clearSecrets', async () => {
      const doDelete = t('Delete');
      const ok = await vscode.window.showWarningMessage(
        t('This deletes the stored owner password and certificate passphrase. Continue?'),
        { modal: true },
        doDelete
      );
      if (ok !== doDelete) {
        return;
      }
      await context.secrets.delete(SECRET_OWNER_PASSWORD);
      await context.secrets.delete(SECRET_CERT_PASSPHRASE);
      vscode.window.showInformationMessage(t('Deleted the stored secrets.'));
    }),

    vscode.commands.registerCommand('markdownFormal.openSettings', async () => {
      // この拡張の設定だけを絞り込んだ状態で設定画面を開く
      await vscode.commands.executeCommand(
        'workbench.action.openSettings',
        '@ext:kazunito.markdown-formal-pdf'
      );
    }),

    vscode.commands.registerCommand('markdownFormal.verifyPdf', async () => {
      const picked = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { PDF: ['pdf'] },
        openLabel: t('Select a PDF to verify'),
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
        const yes = t('yes');
        const no = t('no');
        log(t('Verifying: {0}', filePath));
        log('  ' + t('Pages: {0}', info.pages));
        log('  ' + t('Edit restriction: {0}', info.encrypted ? yes : no));
        log('  ' + t('Digital signature: {0}', info.signed ? yes : no));
        log('  ' + t('SHA-256: {0}', digest));
        log('  ' + t('If this matches the value in the register, the file has not been tampered with.'));
        if (info.signed) {
          log('  ' + t('Check the validity of the signature with Acrobat Reader or pdfsig.'));
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
