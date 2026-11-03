import * as fs from 'fs';
import * as path from 'path';

/**
 * 本文の画像 (![説明](図解/x.png)) を読み込む。PDF と Word の両方が使う。
 *
 * PDF は HTML を一時フォルダに書いてから開くため、相対パスのままでは
 * 元の Markdown の場所で解決されない。ここで元の場所を基準にファイルを読み、
 * PDF は data: URI、Word は ImageRun として本文に埋め込む。
 */

export interface LocalImage {
  data: Buffer;
  /** docx の ImageRun に渡す種類 */
  type: 'png' | 'jpg' | 'gif' | 'svg';
  mime: string;
  /** 画像そのものの大きさ (px)。読み取れない形式は 0 */
  width: number;
  height: number;
}

const MIME: Record<string, { type: LocalImage['type']; mime: string }> = {
  '.png': { type: 'png', mime: 'image/png' },
  '.jpg': { type: 'jpg', mime: 'image/jpeg' },
  '.jpeg': { type: 'jpg', mime: 'image/jpeg' },
  '.gif': { type: 'gif', mime: 'image/gif' },
  '.svg': { type: 'svg', mime: 'image/svg+xml' },
};

/** 埋め込みの対象外 (Web 上の画像・埋め込み済みの画像)。そのまま残す */
export function isRemoteImage(src: string): boolean {
  return /^(https?:|data:)/i.test(src);
}

/** src を元の Markdown の場所を基準にした絶対パスにする */
export function resolveImagePath(src: string, baseDir: string): string {
  let target = src.replace(/[?#].*$/, '');
  try {
    // markdown-it は日本語のファイル名をパーセントエンコードする
    target = decodeURIComponent(target);
  } catch {
    // 不正なエンコードはそのまま使う
  }
  target = target.replace(/^file:\/\//i, '');
  return path.isAbsolute(target) ? target : path.resolve(baseDir, target);
}

/** PNG / JPEG / GIF の大きさをヘッダから読む */
function imageSize(data: Buffer, type: LocalImage['type']): { width: number; height: number } {
  if (type === 'png' && data.length >= 24) {
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }
  if (type === 'gif' && data.length >= 10) {
    return { width: data.readUInt16LE(6), height: data.readUInt16LE(8) };
  }
  if (type === 'jpg') {
    // SOF マーカー (C0〜CF のうち C4・C8・CC を除く) に大きさが入っている
    let offset = 2;
    while (offset + 9 < data.length && data[offset] === 0xff) {
      const marker = data[offset + 1];
      const length = data.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: data.readUInt16BE(offset + 7), height: data.readUInt16BE(offset + 5) };
      }
      offset += 2 + length;
    }
  }
  return { width: 0, height: 0 };
}

/** 画像を読む。読めないときは理由を返す */
export function loadLocalImage(
  src: string,
  baseDir: string
): { image?: LocalImage; error?: string } {
  const file = resolveImagePath(src, baseDir);
  // 通知には利用者が書いたままの (エンコードされていない) パスを出す
  const shown = path.relative(baseDir, file) || file;
  const kind = MIME[path.extname(file).toLowerCase()];
  if (!kind) {
    return { error: `${shown} (unsupported format)` };
  }
  if (!fs.existsSync(file)) {
    return { error: `${shown} (not found)` };
  }
  const data = fs.readFileSync(file);
  return { image: { data, ...kind, ...imageSize(data, kind.type) } };
}
