const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const { pdflibAddPlaceholder } = require('@signpdf/placeholder-pdf-lib');
const { P12Signer } = require('@signpdf/signer-p12');
const signpdf = require('@signpdf/signpdf').default;

(async () => {
  const input = process.argv[2];
  const output = process.argv[3];
  const pdfDoc = await PDFDocument.load(fs.readFileSync(input));
  pdflibAddPlaceholder({
    pdfDoc,
    reason: '正式文書として承認',
    contactInfo: 'infra@example.co.jp',
    name: 'インフラ運用チーム',
    location: 'Tokyo',
  });
  const withPlaceholder = Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
  const signer = new P12Signer(fs.readFileSync('test.p12'), { passphrase: 'testpass' });
  const signed = await signpdf.sign(withPlaceholder, signer);
  fs.writeFileSync(output, signed);
  console.log('署名完了:', output);
})().catch(e => { console.error('失敗:', e.message); process.exit(1); });
