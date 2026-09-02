import * as yaml from 'js-yaml';
import MarkdownIt from 'markdown-it';
import { DocumentMeta, ExportInput, Heading } from './types';

/** Mermaid の置き換え目印。exporter が図に差し替える */
export const MERMAID_PLACEHOLDER = 'data-markdown-formal-mermaid';

/**
 * Markdown の解析。元ファイルは読み取るだけで書き換えない。
 * front matter を分離し、見出しに ID を振り、HTML を組み立てる。
 */

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * front matter の値を文字列に揃える。
 * YAML は `date: 2026-08-08` を Date として解釈するため、そのままでは扱えない。
 */
function normalizeMeta(parsed: Record<string, unknown>): DocumentMeta {
  const meta: Record<string, string> = {};
  for (const key of ['title', 'subtitle', 'author', 'date', 'docno', 'classification']) {
    const value = parsed[key];
    if (value === undefined || value === null) {
      continue;
    }
    if (value instanceof Date) {
      // タイムゾーンでずれないよう UTC の年月日をそのまま使う
      meta[key] = value.toISOString().slice(0, 10);
    } else if (Array.isArray(value)) {
      meta[key] = value.map(String).join('、');
    } else {
      meta[key] = String(value);
    }
  }
  return meta as DocumentMeta;
}

/** front matter を分離する。無ければ meta は空になる */
export function splitFrontMatter(raw: string): { meta: DocumentMeta; body: string } {
  const m = raw.match(FRONT_MATTER);
  if (!m) {
    return { meta: {}, body: raw };
  }
  let meta: DocumentMeta = {};
  try {
    const parsed = yaml.load(m[1]);
    if (parsed && typeof parsed === 'object') {
      meta = normalizeMeta(parsed as Record<string, unknown>);
    }
  } catch {
    // front matter が壊れていても本文の変換は続ける
    meta = {};
  }
  return { meta, body: raw.slice(m[0].length) };
}

/**
 * 見出しテキストからアンカー ID を作る。
 * 日本語をそのまま残し、記号と空白だけを整理する (GitHub 方式に近い)。
 */
export function slugify(text: string, used: Set<string>): string {
  let base =
    text
      .trim()
      .toLowerCase()
      .replace(/[\s　]+/g, '-')
      .replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~]/g, '')
      .replace(/^-+|-+$/g, '') || 'section';

  // 数字や記号で始まる ID は CSS セレクタとして無効になり、
  // 目次のページ番号 (target-counter) の解決に失敗する。必ず英字始まりにする。
  if (!/^[A-Za-z぀-ヿ㐀-鿿]/.test(base)) {
    base = `sec-${base}`;
  }

  let id = base;
  let n = 1;
  while (used.has(id)) {
    id = `${base}-${n++}`;
  }
  used.add(id);
  return id;
}

/**
 * markdown-it のインスタンスを作り、見出しに ID を付与する。
 * Mermaid のコードブロックは図に差し替えるため、目印だけを残して本文を diagrams に集める。
 */
function createRenderer(headings: Heading[], diagrams: string[]): MarkdownIt {
  const md = new MarkdownIt({ html: true, linkify: true, typographer: false });
  const used = new Set<string>();

  const defaultFence =
    md.renderer.rules.fence ||
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const info = (token.info || '').trim().split(/\s+/)[0].toLowerCase();
    if (info === 'mermaid') {
      const index = diagrams.length;
      diagrams.push(token.content);
      return `<figure class="mermaid-figure" ${MERMAID_PLACEHOLDER}="${index}"></figure>\n`;
    }
    return defaultFence(tokens, idx, options, env, self);
  };

  const defaultHeadingOpen =
    md.renderer.rules.heading_open ||
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

  md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const level = Number(token.tag.slice(1));
    const inline = tokens[idx + 1];
    const text = inline && inline.type === 'inline' ? inline.content : '';
    const id = slugify(text, used);

    token.attrSet('id', id);
    headings.push({ level, text, id });

    return defaultHeadingOpen(tokens, idx, options, env, self);
  };

  return md;
}

/** Markdown 全体を解析して変換の入力を作る */
export function parseMarkdown(sourcePath: string, raw: string): ExportInput {
  const { meta, body } = splitFrontMatter(raw);
  const headings: Heading[] = [];
  const md = createRenderer(headings, []);
  // 見出しの収集のために一度描画する。HTML 自体は renderBody で使い回す
  md.render(body);

  return { sourcePath, markdown: body, meta, headings };
}

/**
 * 本文の HTML を生成する。見出し ID は parseMarkdown と同じ規則で振られる。
 * diagrams には Mermaid のコードが出現順に入る。
 */
export function renderBody(body: string): {
  html: string;
  headings: Heading[];
  diagrams: string[];
} {
  const headings: Heading[] = [];
  const diagrams: string[] = [];
  const md = createRenderer(headings, diagrams);
  const html = md.render(body);
  return { html, headings, diagrams };
}
