import { resolveBrowserPath } from './browser';
import { ExportConfig } from './types';

/**
 * 機密区分スタンプを PNG にする。
 *
 * Word の OOXML には CSS の transform に相当する仕組みが無く、
 * 回転できるのは画像と図形だけ。PDF と同じ「傾いた赤枠スタンプ」を Word でも出すため、
 * PDF 化に使うのと同じブラウザでスタンプだけを描画して切り出す。
 *
 * 傾きは docx 側の画像回転で付けるので、ここでは傾けずに描画する。
 */

/** CommonJS へ変換されない本物の動的 import */
const dynamicImport: (specifier: string) => Promise<any> = new Function(
  'specifier',
  'return import(specifier)'
) as (specifier: string) => Promise<any>;

export interface StampImage {
  png: Buffer;
  /** 画像の実寸 (ピクセル)。docx で縦横比を保つために使う */
  width: number;
  height: number;
}

/** スタンプ 1 個ぶんの HTML。PDF 側の CSS と同じ見た目にする */
function stampHtml(text: string, cfg: ExportConfig): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; background: transparent; }
  #stamp {
    display: inline-block;
    font-family: ${cfg.font.heading};
    font-weight: bold;
    font-size: 16pt;
    color: ${cfg.stamp.color};
    letter-spacing: 0.15em;
    border: 2.5pt solid ${cfg.stamp.color};
    border-radius: 2mm;
    padding: 2.5mm 5mm 2.5mm 6mm;
    opacity: 0.85;
  }
</style></head>
<body><span id="stamp">${escaped}</span></body></html>`;
}

/**
 * スタンプ画像を作る。
 * ブラウザが使えない場合は undefined を返し、呼び出し側は文字での代替表示に切り替える。
 */
export async function renderStamp(
  text: string,
  cfg: ExportConfig
): Promise<StampImage | undefined> {
  let browser: any;
  try {
    const browserPath = resolveBrowserPath(cfg.browser.executablePath);
    // 実行ファイルは自前で解決するので puppeteer-core を使う (Chromium の同梱は不要)。
    // require では読み込めない環境があるため動的 import を使う。
    // TypeScript が CommonJS 向けに require へ変換するのを避けるため Function 経由で呼ぶ。
    const mod = await dynamicImport('puppeteer-core');
    const puppeteer: any = mod.default || mod;

    browser = await puppeteer.launch({
      executablePath: browserPath,
      headless: 'new',
      args: ['--disable-dev-shm-usage'],
    });

    const page = await browser.newPage();
    // 拡大して描画してから縮小配置することで、印刷時のギザつきを防ぐ
    await page.setViewport({ width: 900, height: 300, deviceScaleFactor: 3 });
    await page.setContent(stampHtml(text, cfg), { waitUntil: 'load' });

    const element = await page.$('#stamp');
    if (!element) {
      return undefined;
    }
    const box = await element.boundingBox();
    const png = (await element.screenshot({ omitBackground: true })) as Buffer;

    return {
      png: Buffer.isBuffer(png) ? png : Buffer.from(png),
      width: box ? Math.round(box.width) : 160,
      height: box ? Math.round(box.height) : 40,
    };
  } catch {
    // 画像化に失敗しても文書生成は続ける
    return undefined;
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}
