const fs = require('fs');
const { PDFDocument } = require('@cantoo/pdf-lib');
(async () => {
  const pdf = await PDFDocument.load(fs.readFileSync(process.argv[2]));
  pdf.encrypt({
    ownerPassword: 'ChangeMe-Owner-2026',
    permissions: { printing: 'highResolution', modifying: false, copying: true,
                   annotating: false, fillingForms: false, contentAccessibility: true,
                   documentAssembly: false },
  });
  fs.writeFileSync(process.argv[3], await pdf.save());
  console.log('暗号化完了:', process.argv[3]);
})().catch(e => { console.error('失敗:', e.message); process.exit(1); });
