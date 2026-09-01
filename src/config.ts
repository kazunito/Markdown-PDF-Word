import * as vscode from 'vscode';
import { ExportConfig, HeadingStyle, PrintingPermission, ProtectionMode } from './types';

/** VSCode の設定から変換用の設定を組み立てる */
export function loadConfig(resource?: vscode.Uri): ExportConfig {
  const c = vscode.workspace.getConfiguration('markdownFormal', resource);
  const get = <T>(key: string, fallback: T): T => c.get<T>(key) ?? fallback;

  return {
    outputDirectory: get('outputDirectory', ''),

    page: {
      format: get('page.format', 'A4'),
      orientation: get<'portrait' | 'landscape'>('page.orientation', 'portrait'),
      margin: get('page.margin', '18mm'),
    },

    frame: {
      cover: get('frame.cover', false),
      toc: get('frame.toc', true),
      body: get('frame.body', true),
      color: get('frame.color', '#444444'),
      width: get('frame.width', '0.6mm'),
      padding: get('frame.padding', '5mm'),
    },

    font: {
      body: get('font.body', '"Hiragino Mincho ProN", "Yu Mincho", serif'),
      heading: get('font.heading', '"Hiragino Sans", "Yu Gothic", sans-serif'),
      mono: get('font.mono', '"Menlo", "Consolas", monospace'),
      size: get('font.size', '10.5pt'),
      lineHeight: get('font.lineHeight', 1.75),
    },

    heading: {
      style: get<HeadingStyle>('heading.style', 'band'),
      accentColor: get('heading.accentColor', '#4472C4'),
      textColor: get('heading.textColor', '#2E74B5'),
      pageBreakLevel: get('heading.pageBreakLevel', 2),
    },

    cover: {
      enabled: get('cover.enabled', true),
    },

    stamp: {
      color: get('stamp.color', '#CC0000'),
      rotate: get('stamp.rotate', -8),
    },

    toc: {
      enabled: get('toc.enabled', true),
      depth: get('toc.depth', 3),
      title: get('toc.title', 'Contents'),
    },

    pageNumber: {
      enabled: get('pageNumber.enabled', true),
      position: get('pageNumber.position', 'bottom-center'),
    },

    outline: {
      enabled: get('outline.enabled', true),
    },

    protection: {
      mode: get<ProtectionMode>('protection.mode', 'restrict'),
      permissions: {
        printing: get<PrintingPermission>('protection.permissions.printing', 'highResolution'),
        copying: get('protection.permissions.copying', true),
        annotating: get('protection.permissions.annotating', false),
      },
    },

    signing: {
      certificatePath: get('signing.certificatePath', ''),
      reason: get('signing.reason', 'Approved as an official document'),
      location: get('signing.location', ''),
      contactInfo: get('signing.contactInfo', ''),
    },

    hash: {
      emit: get('hash.emit', true),
    },

    browser: {
      executablePath: get('browser.executablePath', ''),
    },

    docx: {
      enabled: get('docx.enabled', true),
    },

    customCss: get('customCss', ''),
  };
}
