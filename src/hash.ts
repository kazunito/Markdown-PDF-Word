import * as crypto from 'crypto';
import * as path from 'path';

/**
 * SHA-256 による指紋。
 * 閲覧環境に依存しない改ざん検知手段として、出力と同時に記録する。
 * 文書管理台帳に控え、受入時に照合する運用で使う。
 */

export function sha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * shasum / sha256sum -c で検証できる形式の行を作る。
 * 例: "642ad3...  手順書.pdf"
 */
export function sha256Line(buffer: Buffer, filePath: string): string {
  return `${sha256(buffer)}  ${path.basename(filePath)}\n`;
}
