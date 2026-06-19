---
name: gmail-to-drive
description: Convert email bodies from a specified Gmail label (folder) into Markdown (.md) files and save them to a specified Google Drive folder, with daily scheduled execution and de-duplication of already-processed emails. Use when the user wants to set up, configure, deploy, run, or troubleshoot this Gmail→Drive Markdown export (Google Apps Script). Triggers include requests mentioning Gmail labels, exporting/archiving emails to Drive as Markdown, or scheduling a daily mail export.
---

# Gmail → Markdown → Google Drive 変換スキル

指定 Gmail ラベル内のメール本文を Markdown 化し、指定 Google ドライブフォルダへ
保存する Google Apps Script (GAS) を、セットアップ・運用するためのスキルです。

実体のコードは `gmail-to-drive/` にあります。

- `gmail-to-drive/Code.gs` … 変換・保存・スケジュール登録の本体
- `gmail-to-drive/appsscript.json` … GAS マニフェスト
- `gmail-to-drive/README.md` … 詳細手順

## このスキルでできること

1. **変換と保存**: 対象ラベルのメール本文を `.md` にして指定ドライブフォルダへ保存
2. **毎日自動実行**: 指定時刻に走る GAS 時刻トリガーを登録
3. **重複防止**: 処理済みラベル + メッセージ ID 記録 + 同名ファイル確認の 3 段ガード

## 対応手順

ユーザーの依頼内容に応じて以下を行う。

### 設定変更を頼まれた場合

`gmail-to-drive/Code.gs` 冒頭の `CONFIG` を編集する。

- `GMAIL_LABEL`: 変換対象の Gmail ラベル名（フォルダ）
- `DRIVE_FOLDER_ID`: 保存先フォルダ ID（URL の `/folders/` 以降）
- `PROCESSED_LABEL`: 処理済みラベル名
- `DAILY_HOUR`: 毎日の実行時刻（0〜23）
- `MAX_THREADS`: 1 回で処理する最大スレッド数

値が未指定なら、推測せずユーザーに確認する。

### デプロイ／実行方法を聞かれた場合

`gmail-to-drive/README.md` の「セットアップ手順」を案内する。要点:

1. <https://script.google.com> で新規プロジェクトを作り `Code.gs` / `appsscript.json` を反映
   （または `clasp push`）
2. `CONFIG` を編集
3. `convertGmailToDrive` を手動実行して権限承認
4. `setupDailyTrigger` を実行して毎日実行を登録
   （停止は `removeDailyTrigger`）

### 仕様変更・不具合対応を頼まれた場合

`Code.gs` を編集する。重複防止ロジック（`loadProcessedIds_` / `saveProcessedIds_` /
処理済みラベル / 同名ファイル確認）を壊さないよう注意する。

## 注意点

- 本文はプレーンテキストを Markdown 化（HTML 装飾・添付は対象外）。
- 1 通＝1 ファイル。同一スレッドの複数メールは個別保存。
- スケジュール・Gmail/Drive アクセスは GAS 側で動く。Claude Code 自身は実行しない。
