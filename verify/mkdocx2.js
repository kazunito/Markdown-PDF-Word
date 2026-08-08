const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, PageBreak, Footer, PageNumber,
  TableOfContents, AlignmentType, BorderStyle, SectionType, ShadingType, LevelFormat,
} = require('docx');

const pageBorder = { style: BorderStyle.SINGLE, size: 12, color: '444444', space: 24 };
const borders = { pageBorderTop: pageBorder, pageBorderBottom: pageBorder,
                  pageBorderLeft: pageBorder, pageBorderRight: pageBorder };

const doc = new Document({
  styles: {
    default: {
      document: { run: { font: { ascii: 'Times New Roman', eastAsia: 'Yu Mincho' }, size: 21 },
                  paragraph: { spacing: { line: 300 } } },
    },
    paragraphStyles: [
      { // 見出し1: 青帯 + 白抜き文字
        id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 28, bold: true, color: 'FFFFFF',
               font: { ascii: 'Arial', eastAsia: 'Yu Gothic' } },
        paragraph: {
          spacing: { before: 360, after: 200 },
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: '4472C4' },
          indent: { left: 120 },
        },
      },
      { // 見出し2: 青文字 + 下罫線
        id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, color: '2E74B5',
               font: { ascii: 'Arial', eastAsia: 'Yu Gothic' } },
        paragraph: {
          spacing: { before: 300, after: 140 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: '333333', space: 4 } },
        },
      },
    ],
  },
  sections: [
    {
      properties: { page: { borders, pageNumbers: { start: 1 } } },
      footers: { default: new Footer({ children: [ new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [ new TextRun({ children: [PageNumber.CURRENT] }) ] }) ] }) },
      children: [
        new Paragraph({ text: '第1章　はじめに', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('本書は、AWS 東京リージョン(ap-northeast-1)に構築するプライマリインフラストラクチャの設計書です。東京リージョンは「本番環境(Production)」と「開発環境(Development)」の 2 つの環境を同一リージョン内に共存させた構成です。災害対策(DR)環境は大阪リージョン(ap-northeast-3)に別途構築します。'),
        new Paragraph({ text: '1.1　AWS CloudFormation とは', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('AWS CloudFormation(クラウドフォーメーション)は、AWS のインフラをコード(YAML/JSON ファイル)で管理するサービスです。「インフラをコードとして管理する」考え方を Infrastructure as Code(IaC)と呼びます。設定ファイル(テンプレート)を一度作成すれば、同じ構成を何度でも正確に再現でき、人的ミスを防ぐ効果があります。'),
        new Paragraph({ text: '1.2　本番・開発環境の基本方針', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('本東京環境は以下の方針で設計しています。'),
      ],
    },
  ],
});

Packer.toBuffer(doc).then(b => {
  fs.writeFileSync('/Users/nito/Code/_word-check2.docx', b);
  console.log('生成: /Users/nito/Code/_word-check2.docx', b.length, 'bytes');
});
