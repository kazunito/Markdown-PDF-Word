const fs = require('fs');
const { PDFDocument } = require('@cantoo/pdf-lib');

(async () => {
  const src = fs.readFileSync('stamp2.pdf');
  const pdf = await PDFDocument.load(src);
  pdf.encrypt({
    ownerPassword: 'ChangeMe-Owner-2026',   // 権限を解除できる管理者用パスワード
    // userPassword は設定しない → 誰でも開けるが編集は不可
    permissions: {
      printing: 'highResolution',
      modifying: false,          // 内容の変更を禁止
      copying: true,             // テキストコピーは許可
      annotating: false,         // 注釈追加を禁止
      fillingForms: false,
      contentAccessibility: true,
      documentAssembly: false,   // ページの追加削除・回転を禁止
    },
  });
  fs.writeFileSync('protected.pdf', await pdf.save());
  console.log('OK: protected.pdf を生成');
})();
