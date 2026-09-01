# Markdown Formal PDF / Word

**English** · [日本語](README.ja.md)

A VSCode extension that converts Markdown into formal PDF and Word (.docx) documents.
**Your Markdown file is never modified.**

## Features

| Feature | PDF | Word |
|---|---|---|
| Leaves the Markdown source untouched | Yes | Yes |
| Cover page generated from front matter | Yes | Yes |
| Document control number on the cover | Yes | Yes |
| Red confidentiality stamp | Yes (rotated) | Yes (rotated; the same image as the PDF) |
| Table of contents with real page numbers | Yes | Yes (Word updates the field) |
| No page numbers on cover/TOC; body starts at 1 | Yes | Yes |
| Page break before each chapter | Yes | Yes |
| Page border, configurable per page kind | Yes | Yes |
| Font and heading style presets | Yes | Yes |
| Wide tables and long lines fitted to the page | Yes | Yes |
| Long tables, code blocks and quotes split at page boundaries (no half-empty page) | Yes | Yes |
| Header row repeated on continued pages | — | Yes |
| PDF outline (bookmarks) | Yes | — |
| Edit restriction (permissions password) | Yes | — |
| Digital signature (tamper detection) | Yes | — |
| SHA-256 fingerprint file | Yes | Yes |

Word output is intended as an **editable draft**. The PDF is the authoritative copy.

## Requirements

- VSCode 1.85 or later
- **Google Chrome or Microsoft Edge** — used as the rendering engine for PDF output
  - Standard install locations are detected automatically
  - Otherwise set `markdownFormal.browser.executablePath`
  - No Chromium download is performed

Works on Windows, macOS and Linux. Everything is pure JavaScript, so a single VSIX covers all three.

## Usage

1. Open a Markdown file
2. Run one of the commands from the command palette:
   - `Markdown Formal: Convert to PDF`
   - `Markdown Formal: Convert to Word (docx)`
   - `Markdown Formal: Convert to both PDF and Word`

The cover page is built from front matter:

```markdown
---
title: System Operations Manual
subtitle: Revision 1.0
author: Infrastructure Team
date: 2026-08-08
docno: DOC-INF-2026-0142
classification: CONFIDENTIAL
---

# 1. Introduction
```

| front matter | Position on the cover |
|---|---|
| `docno` | Top left (document control number) |
| `classification` | Top right (red stamp) |
| `title` / `subtitle` | Centre |
| `author` / `date` | Below the centre |

## Main settings

| Setting | Default | Description |
|---|---|---|
| `markdownFormal.page.format` | `A4` | Paper size |
| `markdownFormal.page.orientation` | `portrait` | Paper orientation (whole document) |
| `markdownFormal.frame.cover` | `false` | Draw a page border on the cover |
| `markdownFormal.frame.toc` | `true` | Draw a page border on the table of contents |
| `markdownFormal.frame.body` | `true` | Draw a page border on the body |
| `markdownFormal.heading.style` | `band` | Heading decoration (`plain` / `band` / `underline`) |
| `markdownFormal.heading.pageBreakLevel` | `2` | Break the page before headings up to this level |
| `markdownFormal.toc.depth` | `3` | Heading levels listed in the table of contents |
| `markdownFormal.protection.mode` | `restrict` | Protection mode (`none` / `restrict` / `sign`) |
| `markdownFormal.hash.emit` | `true` | Also write a `.sha256` file |

All settings are edited from the settings screen. Run
`Markdown Formal: Open settings` from the command palette to open it filtered to this extension.

Give fonts a fallback chain so that they resolve on all three operating systems
(the defaults are ordered Hiragino → Yu → Noto).

## Display language

The interface follows the display language of VSCode. English is the default and
Japanese is available; any other language falls back to English.
Run `Configure Display Language` from the command palette to switch.

Two settings put text into the document itself rather than on screen, so they are
**not** switched by the display language. Change them when you write in another language:

| Setting | Default | For a Japanese document |
|---|---|---|
| `markdownFormal.toc.title` | `Contents` | `目次` |
| `markdownFormal.signing.reason` | `Approved as an official document` | `正式文書として承認` |

## Important limitations of the protection features

- **Edit restriction** is advisory under the PDF specification. Viewers are free to ignore it,
  and some do. It **does not prevent tampering**.
- **Digital signature** provides **detection**, not prevention. The document can still be edited;
  the signature becomes invalid so that readers can tell.
- **The two cannot be combined.** Encryption rewrites the whole file and breaks the signed byte
  range, so the setting is exclusive.
- Signature verification **depends on the viewer**. Chrome cannot validate PDF signatures.
  Adobe Acrobat Reader is recommended.

When you cannot mandate a viewer, record the **SHA-256 fingerprint** in your document register
and verify it on receipt. That check does not depend on any viewer.

```bash
shasum -a 256 -c document.pdf.sha256
```

## Secrets

Owner passwords and certificate passphrases are stored **only in VSCode SecretStorage**,
never in `settings.json`. Signing certificates (`.p12` / `.pfx`) must live outside the
repository; the bundled `.gitignore` excludes certificates, keys and password files.

## License

MIT
