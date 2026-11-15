import * as fs from 'fs';
import * as path from 'path';
import { t } from './i18n';
import { splitFrontMatter } from './markdown';
import { ExportConfig } from './types';

function mapping(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function content(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function markdownText(value: string): string {
  return value.replace(/[!-/:-@[-`{-~]/g, '\\$&');
}

function hasOkfBundle(sourcePath: string): boolean {
  let directory = path.dirname(path.resolve(sourcePath));
  for (;;) {
    try {
      const index = fs.readFileSync(path.join(directory, 'index.md'), 'utf8');
      const version = mapping(splitFrontMatter(index).fields).okf_version;
      if (version !== undefined) {
        return version === '0.2' || version === 0.2;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        return false;
      }
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      return false;
    }
    directory = parent;
  }
}

function sourceEntry(value: unknown): string {
  const source = mapping(value);
  const resource = typeof source.resource === 'string' ? source.resource.trim() : '';
  if (!resource) {
    return '';
  }
  const title = content(source.title);
  const label = markdownText(title || content(resource));
  if (/^https?:\/\/[^\s<>]+$/i.test(resource)) {
    return `[${label}](<${resource}>)`;
  }
  return title ? `${label} — ${markdownText(content(resource))}` : label;
}

function verificationEntry(value: unknown): string {
  const { by, at } = mapping(value);
  const actor = content(by);
  const date = at instanceof Date ? at.toISOString() : content(at);
  return actor && date ? markdownText(`${actor} (${date})`) : '';
}

/** Both exporters use the same optional, localized Markdown sections. */
export function okfAppendix(sourcePath: string, raw: string, cfg: ExportConfig, notes: string[]): string {
  const format = cfg.inputFormat ?? 'auto';
  if (format === 'markdown' || /^(index|log)\.md$/.test(path.basename(sourcePath))) {
    return '';
  }
  const fields = mapping(splitFrontMatter(raw).fields);
  if (!content(fields.type)) {
    if (format === 'okf') {
      notes.push(t('The OKF document needs a non-empty type in its YAML front matter.'));
    }
    return '';
  }
  if (!cfg.includeOkfDetails) {
    return '';
  }
  if (format === 'auto' && !hasOkfBundle(sourcePath)) {
    return '';
  }

  const description = content(fields.description);
  const sources = Array.isArray(fields.sources)
    ? fields.sources.map(sourceEntry).filter(Boolean)
    : [];
  const verified = (Array.isArray(fields.verified) ? fields.verified : [fields.verified])
    .map(verificationEntry).filter(Boolean);

  const sections = [
    [t('Summary'), markdownText(description)],
    [t('Sources'), sources.map((item) => '- ' + item).join('\n')],
    [t('Verification'), verified.map((item) => '- ' + item).join('\n')],
  ];
  const details = sections.filter(([, body]) => body);
  if (!details.length) {
    return '';
  }
  return `\n\n## ${t('OKF details')}\n` +
    details.map(([title, body]) => `\n### ${title}\n\n${body}\n`).join('');
}
