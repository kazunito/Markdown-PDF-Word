import * as path from 'path';
import { resolveBrowserPath } from './browser';
import { ExportConfig } from './types';

/**
 * Mermaid のコードブロックを図にする。
 *
 * PDF・Word のどちらも独自に図を描く仕組みを持たないため、
 * PDF 化に使うのと同じブラウザで mermaid を実行し、
 * PDF には SVG (拡大しても粗くならない) を、Word には PNG を渡す。
 *
 * mermaid は純 JavaScript のため、OS 別のビルドは不要。
 */

/** CommonJS へ変換されない本物の動的 import */
const dynamicImport: (specifier: string) => Promise<any> = new Function(
  'specifier',
  'return import(specifier)'
) as (specifier: string) => Promise<any>;

export interface MermaidImage {
  /** 描画できた SVG。失敗した場合は undefined */
  svg?: string;
  /** Word 用の PNG。needPng が false のときと失敗時は undefined */
  png?: Buffer;
  /** 図の実寸 (CSS ピクセル)。Word で縦横比を保つために使う */
  width: number;
  height: number;
  /** 描画に失敗した理由。呼び出し側はコードブロックのまま出力する */
  error?: string;
}

/**
 * 同梱した mermaid の場所。
 * scripts/copy-mermaid.js が out/vendor/ に置く 1 ファイルだけを使う
 * (mermaid の依存一式は配布物に含めない)。
 */
function mermaidBundlePath(): string {
  return path.join(__dirname, 'vendor', 'mermaid.min.js');
}

/** 図を包む最小限の HTML。文書と同じ書体で描くために font-family を渡す */
function wrapperHtml(fontFamily: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; background: #ffffff; font-family: ${fontFamily}; }
  #box { display: inline-block; }
</style></head><body><div id="box"></div></body></html>`;
}

/**
 * Mermaid のコードをまとめて描画する。
 *
 * ブラウザの起動は 1 回だけ行う。図が 1 つも無い場合は起動しない。
 * ブラウザが使えない場合や記法に誤りがある場合も例外は投げず、
 * error を入れて返す (呼び出し側でコードブロックとして出力する)。
 */
export async function renderMermaid(
  codes: string[],
  cfg: ExportConfig,
  needPng: boolean
): Promise<MermaidImage[]> {
  if (codes.length === 0) {
    return [];
  }

  const failAll = (message: string): MermaidImage[] =>
    codes.map(() => ({ width: 0, height: 0, error: message }));

  let browser: any;
  try {
    const browserPath = resolveBrowserPath(cfg.browser.executablePath);
    const mod = await dynamicImport('puppeteer-core');
    const puppeteer: any = mod.default || mod;

    browser = await puppeteer.launch({
      executablePath: browserPath,
      headless: 'new',
      args: ['--disable-dev-shm-usage'],
    });

    const page = await browser.newPage();
    // Word 用の PNG は本文幅まで引き伸ばすため、3 倍の解像度で描いて粗さを防ぐ
    await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 3 });
    await page.setContent(wrapperHtml(cfg.font.body), { waitUntil: 'load' });
    await page.addScriptTag({ path: mermaidBundlePath() });

    // 図ごとに SVG を作る。1 つ失敗しても残りは描画する
    const rendered: { svg?: string; error?: string }[] = await page.evaluate(
      async (sources: string[], theme: string, fontFamily: string) => {
        const mermaid = (globalThis as any).mermaid;
        mermaid.initialize({
          startOnLoad: false,
          theme,
          fontFamily,
          securityLevel: 'strict',
        });

        const results: { svg?: string; error?: string }[] = [];
        for (let i = 0; i < sources.length; i++) {
          try {
            const { svg } = await mermaid.render(`markdown-formal-mermaid-${i}`, sources[i]);
            results.push({ svg });
          } catch (e) {
            results.push({ error: String((e && (e as Error).message) || e) });
          }
        }
        return results;
      },
      codes,
      cfg.mermaid.theme,
      cfg.font.body
    );

    const images: MermaidImage[] = [];
    for (const item of rendered) {
      if (!item.svg) {
        images.push({ width: 0, height: 0, error: item.error || 'unknown error' });
        continue;
      }

      // 実寸を測る。Word の画像サイズと PDF の中央寄せに使う
      await page.evaluate((svg: string) => {
        (globalThis as any).document.getElementById('box').innerHTML = svg;
      }, item.svg);

      const box = await page.$('#box');
      const rect = box ? await box.boundingBox() : undefined;
      const width = rect ? Math.round(rect.width) : 0;
      const height = rect ? Math.round(rect.height) : 0;

      let png: Buffer | undefined;
      if (needPng && box) {
        const shot = await box.screenshot({ omitBackground: false });
        png = Buffer.isBuffer(shot) ? shot : Buffer.from(shot);
      }

      images.push({ svg: item.svg, png, width, height });
    }

    return images;
  } catch (e) {
    return failAll(String((e as Error).message || e));
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}
