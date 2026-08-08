import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { t } from './i18n';

/**
 * Chrome / Edge の実行ファイルを探す。
 * PDF 化にはレンダリングエンジンが必要なため、いずれかが必須。
 * 見つからない場合は設定 markdownFormal.browser.executablePath で明示指定してもらう。
 */

function candidatesForPlatform(): string[] {
  const home = os.homedir();

  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      path.join(home, 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    ];
  }

  if (process.platform === 'win32') {
    const programFiles = process.env['PROGRAMFILES'] || 'C:\\Program Files';
    const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
    const localAppData = process.env['LOCALAPPDATA'] || path.join(home, 'AppData', 'Local');
    return [
      path.join(programFiles, 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(programFilesX86, 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(localAppData, 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(programFiles, 'Microsoft\\Edge\\Application\\msedge.exe'),
      path.join(programFilesX86, 'Microsoft\\Edge\\Application\\msedge.exe'),
    ];
  }

  // Linux
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
    '/usr/bin/microsoft-edge-stable',
    '/snap/bin/chromium',
    '/opt/google/chrome/chrome',
  ];
}

/**
 * ブラウザの実行ファイルを解決する。
 * @param configured 設定で明示指定されたパス (空なら自動検出)
 */
export function resolveBrowserPath(configured: string): string {
  if (configured) {
    if (!fs.existsSync(configured)) {
      throw new Error(
        t(
          'The configured browser was not found: {0}\nCheck markdownFormal.browser.executablePath.',
          configured
        )
      );
    }
    return configured;
  }

  for (const candidate of candidatesForPlatform()) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    t(
      'Neither Chrome nor Edge was found.\nPDF output needs a rendering engine. Install one of them, or set the path to the executable in markdownFormal.browser.executablePath.'
    )
  );
}
