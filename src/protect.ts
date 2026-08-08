import * as fs from 'fs';
import { ExportConfig } from './types';

/**
 * PDF の保護。
 *
 * 重要な前提:
 * - 編集制限 (権限パスワード) は PDF 仕様上ビューア任せの「助言」であり、
 *   強制力はない。無視する閲覧ソフトが実在するため改ざん防止にはならない。
 * - 電子署名は「防止」ではなく「検知」。署名後も編集自体は可能で、
 *   編集されると署名が無効になることで改ざんを判別する。
 * - 両者は併用できない (暗号化がファイル全体を書き直すため署名範囲が壊れる)。
 *   このため設定 protection.mode は排他とする。
 */

/** 編集制限をかける。閲覧はパスワードなしで可能 */
export async function restrictPdf(
  pdfBytes: Buffer,
  ownerPassword: string,
  cfg: ExportConfig
): Promise<Buffer> {
  const { PDFDocument } = require('@cantoo/pdf-lib');
  const pdf = await PDFDocument.load(pdfBytes);

  const printing = cfg.protection.permissions.printing;

  pdf.encrypt({
    ownerPassword,
    // userPassword は設定しない = 誰でも開けるが編集はできない
    permissions: {
      printing: printing === 'none' ? false : printing,
      modifying: false,
      copying: cfg.protection.permissions.copying,
      annotating: cfg.protection.permissions.annotating,
      fillingForms: false,
      contentAccessibility: true,
      documentAssembly: false,
    },
  });

  return Buffer.from(await pdf.save());
}

/** 電子署名を付ける。証明書 (.p12 / .pfx) とパスフレーズが必要 */
export async function signPdf(
  pdfBytes: Buffer,
  passphrase: string,
  cfg: ExportConfig
): Promise<Buffer> {
  const certPath = cfg.signing.certificatePath;
  if (!certPath) {
    throw new Error(
      '署名用証明書が設定されていません。\n' +
        'markdownFormal.signing.certificatePath に .p12 / .pfx の絶対パスを指定してください。'
    );
  }
  if (!fs.existsSync(certPath)) {
    throw new Error(`署名用証明書が見つかりません: ${certPath}`);
  }

  const { PDFDocument } = require('pdf-lib');
  const { pdflibAddPlaceholder } = require('@signpdf/placeholder-pdf-lib');
  const { P12Signer } = require('@signpdf/signer-p12');
  const signpdfModule = require('@signpdf/signpdf');
  const signpdf = signpdfModule.default || signpdfModule;

  const pdfDoc = await PDFDocument.load(pdfBytes);
  pdflibAddPlaceholder({
    pdfDoc,
    reason: cfg.signing.reason,
    contactInfo: cfg.signing.contactInfo,
    name: cfg.signing.location ? undefined : undefined,
    location: cfg.signing.location,
  });

  const withPlaceholder = Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
  const signer = new P12Signer(fs.readFileSync(certPath), { passphrase });
  return signpdf.sign(withPlaceholder, signer);
}

/** 保護状態を読み取る。検証コマンドで使う */
export async function inspectPdf(pdfBytes: Buffer): Promise<{
  encrypted: boolean;
  signed: boolean;
  pages: number;
}> {
  const { PDFDocument, PDFName } = require('pdf-lib');

  let encrypted = false;
  let pages = 0;
  let signed = false;

  try {
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    encrypted = doc.isEncrypted === true;
    pages = doc.getPageCount();
    const acroForm = doc.catalog.get(PDFName.of('AcroForm'));
    if (acroForm) {
      // 署名フィールドがあれば SigFlags が立つ
      signed = true;
    }
  } catch {
    // 読み取れない場合はバイト列から推測する
    const text = pdfBytes.toString('latin1');
    encrypted = text.includes('/Encrypt');
    signed = text.includes('/ByteRange');
  }

  return { encrypted, signed, pages };
}
