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
| Red confidentiality stamp | Yes (rotated) | Yes (not rotated) |
| Table of contents with real page numbers | Yes | Yes (Word updates the field) |
| No page numbers on cover/TOC; body starts at 1 | Yes | Yes |
| Page break before each chapter | Yes | Yes |
| Page border, configurable per page kind | Yes | Yes |
| Font and heading style presets | Yes | Yes |
| Wide tables and long lines fitted to the page | Yes | Yes |
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
   - `Markdown Formal: PDF に変換`
   - `Markdown Formal: Word (docx) に変換`
   - `Markdown Formal: PDF と Word の両方に変換`

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
