/**
 * front matter と設定値の型定義。
 * Markdown 本体は読み取るだけで、書き換えは一切行わない。
 */

/** Markdown 先頭の front matter から読み取る文書情報 */
export interface DocumentMeta {
  /** 題名。表紙の中央に大きく出る */
  title?: string;
  /** 副題。版数などに使う */
  subtitle?: string;
  /** 作成者 */
  author?: string;
  /** 日付 */
  date?: string;
  /** 文書管理番号。表紙の左上に出る */
  docno?: string;
  /** 機密区分。表紙の右上に赤いスタンプとして出る (例: 社外秘) */
  classification?: string;
}

/** 見出し 1 個ぶんの情報。目次と Word 出力の両方で使う */
export interface Heading {
  /** 階層 (1 = h1) */
  level: number;
  /** 表示文字列 */
  text: string;
  /** アンカー用 ID */
  id: string;
}

export type ProtectionMode = 'none' | 'restrict' | 'sign';
/** Mermaid の配色。neutral は白黒印刷向き */
export type MermaidTheme = 'default' | 'neutral' | 'forest' | 'dark';
export type HeadingStyle = 'plain' | 'band' | 'underline';
export type PrintingPermission = 'none' | 'lowResolution' | 'highResolution';

/** 拡張の設定をまとめたもの。VSCode の設定から組み立てる */
export interface ExportConfig {
  outputDirectory: string;

  page: {
    format: string;
    orientation: 'portrait' | 'landscape';
    margin: string;
  };

  frame: {
    cover: boolean;
    toc: boolean;
    body: boolean;
    color: string;
    width: string;
    padding: string;
  };

  font: {
    body: string;
    heading: string;
    mono: string;
    size: string;
    lineHeight: number;
  };

  heading: {
    style: HeadingStyle;
    accentColor: string;
    textColor: string;
    pageBreakLevel: number;
  };

  cover: {
    enabled: boolean;
  };

  stamp: {
    color: string;
    rotate: number;
  };

  toc: {
    enabled: boolean;
    depth: number;
    title: string;
  };

  pageNumber: {
    enabled: boolean;
    position: string;
  };

  outline: {
    enabled: boolean;
  };

  protection: {
    mode: ProtectionMode;
    permissions: {
      printing: PrintingPermission;
      copying: boolean;
      annotating: boolean;
    };
  };

  signing: {
    certificatePath: string;
    reason: string;
    location: string;
    contactInfo: string;
  };

  hash: {
    emit: boolean;
  };

  browser: {
    executablePath: string;
  };

  docx: {
    enabled: boolean;
  };

  mermaid: {
    enabled: boolean;
    theme: MermaidTheme;
    maxWidth: number;
  };

  customCss: string;
}

/** 変換の入力一式 */
export interface ExportInput {
  /** 元の Markdown ファイルの絶対パス */
  sourcePath: string;
  /** front matter を除いた本文 */
  markdown: string;
  /** front matter から読み取った文書情報 */
  meta: DocumentMeta;
  /** 本文から抽出した見出し */
  headings: Heading[];
}
