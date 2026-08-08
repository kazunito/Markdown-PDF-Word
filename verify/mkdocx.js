const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, PageBreak,
  Footer, PageNumber, TableOfContents, AlignmentType, BorderStyle, SectionType,
} = require('docx');

const pageBorder = { style: BorderStyle.SINGLE, size: 12, color: '444444', space: 24 };
const borders = { pageBorderTop: pageBorder, pageBorderBottom: pageBorder,
                  pageBorderLeft: pageBorder, pageBorderRight: pageBorder };

const doc = new Document({
  sections: [
    { // 表紙: ページ番号なし
      properties: { page: { borders } },
      children: [
        new Paragraph({ alignment: AlignmentType.LEFT,
          children: [new TextRun({ text: 'DOC-INF-2026-0142', size: 20 })] }),
        new Paragraph({ alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: ' 社外秘 ', bold: true, size: 32, color: 'CC0000' })],
          border: { top: {style:BorderStyle.SINGLE,size:18,color:'CC0000'},
                    bottom:{style:BorderStyle.SINGLE,size:18,color:'CC0000'},
                    left:  {style:BorderStyle.SINGLE,size:18,color:'CC0000'},
                    right: {style:BorderStyle.SINGLE,size:18,color:'CC0000'} } }),
        new Paragraph({ text: '', spacing: { before: 3000 } }),
        new Paragraph({ alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: 'システム運用手順書', bold: true, size: 48 })] }),
      ],
    },
    { // 目次: ページ番号なし
      properties: { type: SectionType.NEXT_PAGE, page: { borders } },
      children: [
        new Paragraph({ text: '目次', heading: HeadingLevel.HEADING_1 }),
        new TableOfContents('目次', { hyperlink: true, headingStyleRange: '1-3' }),
      ],
    },
    { // 本文: ページ番号を 1 から
      properties: { type: SectionType.NEXT_PAGE, page: { borders, pageNumbers: { start: 1 } } },
      footers: { default: new Footer({ children: [ new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [ new TextRun({ children: [PageNumber.CURRENT] }) ] }) ] }) },
      children: [
        new Paragraph({ text: '第1章 概要', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('本手順書の目的を記す。'),
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({ text: '第2章 事前準備', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('事前確認の内容。'),
      ],
    },
  ],
});

Packer.toBuffer(doc).then(b => { fs.writeFileSync('out.docx', b); console.log('生成: out.docx', b.length, 'bytes'); });
