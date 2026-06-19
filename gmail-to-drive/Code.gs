/**
 * Gmail → Markdown → Google Drive 変換スクリプト（Google Apps Script）
 *
 * 指定した Gmail ラベル（フォルダ）内のメール本文を Markdown(.md) に変換し、
 * 指定した Google ドライブのフォルダに保存します。
 * 処理済みのメールは「処理済みラベル」と Script Properties の二重管理で
 * 記録し、次回以降は対象から除外して重複を防ぎます。
 *
 * 使い方の概要:
 *   1. 下の CONFIG を自分の環境に合わせて書き換える
 *   2. 一度 `convertGmailToDrive` を手動実行して権限を承認する
 *   3. `setupDailyTrigger` を実行して毎日の自動実行を登録する
 *
 * 詳しい手順は同じフォルダの README.md を参照してください。
 */

/** ===== 設定（ここを自分の環境に合わせて変更してください） ===== */
const CONFIG = {
  // 変換対象の Gmail ラベル名（＝Gmail上の「フォルダ」）。
  // 例: 'ToConvert' や '保存対象' など。ネストは 'Parent/Child' のように指定。
  GMAIL_LABEL: 'ToConvert',

  // 保存先 Google ドライブフォルダの ID。
  // フォルダを開いた時の URL の /folders/ より後ろの文字列。
  // 例: https://drive.google.com/drive/folders/XXXXXXXXXXXX → 'XXXXXXXXXXXX'
  DRIVE_FOLDER_ID: 'PUT_YOUR_DRIVE_FOLDER_ID_HERE',

  // 処理済みメールに付ける Gmail ラベル名（無ければ自動作成されます）。
  PROCESSED_LABEL: 'Converted',

  // 毎日の自動実行時刻（0〜23 時、スクリプトのタイムゾーン基準）。
  DAILY_HOUR: 6,

  // 1 回の実行で処理する最大スレッド数（実行時間切れ対策）。
  MAX_THREADS: 50,
};
/** ============================================================= */

const PROCESSED_IDS_KEY = 'PROCESSED_MESSAGE_IDS';

/**
 * メイン処理。対象ラベルの未処理メールを Markdown 化してドライブに保存する。
 * 手動実行・トリガー実行の両方からこの関数が呼ばれます。
 */
function convertGmailToDrive() {
  const label = GmailApp.getUserLabelByName(CONFIG.GMAIL_LABEL);
  if (!label) {
    throw new Error('Gmail ラベルが見つかりません: ' + CONFIG.GMAIL_LABEL);
  }

  const folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  const processedLabel = getOrCreateLabel(CONFIG.PROCESSED_LABEL);
  const processedIds = loadProcessedIds_();

  // 対象ラベルが付いていて、かつ処理済みラベルが付いていないスレッドのみ検索。
  const query =
    'label:' + toQueryLabel_(CONFIG.GMAIL_LABEL) +
    ' -label:' + toQueryLabel_(CONFIG.PROCESSED_LABEL);

  const threads = GmailApp.search(query, 0, CONFIG.MAX_THREADS);
  Logger.log('対象スレッド数: %s', threads.length);

  let savedCount = 0;
  let skippedCount = 0;

  threads.forEach(function (thread) {
    const messages = thread.getMessages();

    messages.forEach(function (message) {
      const id = message.getId();

      // Script Properties 側の二重チェック（ラベル付与が失敗していても弾く）。
      if (processedIds[id]) {
        skippedCount++;
        return;
      }

      const fileName = buildFileName_(message);

      // 同名ファイルが既に存在する場合も作成しない（重複防止の最終ガード）。
      if (folder.getFilesByName(fileName).hasNext()) {
        processedIds[id] = true;
        skippedCount++;
        return;
      }

      const markdown = buildMarkdown_(message);
      folder.createFile(fileName, markdown, 'text/markdown');

      processedIds[id] = true;
      savedCount++;
    });

    // スレッド単位で処理済みラベルを付与（次回の検索対象から外れる）。
    thread.addLabel(processedLabel);
  });

  saveProcessedIds_(processedIds);
  Logger.log('保存: %s 件 / スキップ(処理済み): %s 件', savedCount, skippedCount);
  return { saved: savedCount, skipped: skippedCount };
}

/**
 * メール1通から Markdown 文字列を生成する。
 */
function buildMarkdown_(message) {
  const subject = message.getSubject() || '(件名なし)';
  const from = message.getFrom();
  const to = message.getTo();
  const cc = message.getCc();
  const date = message.getDate();
  const tz = Session.getScriptTimeZone();
  const dateStr = Utilities.formatDate(date, tz, 'yyyy-MM-dd HH:mm:ss');

  // 本文はプレーンテキストを採用（HTML より Markdown として扱いやすい）。
  const body = (message.getPlainBody() || '').replace(/\r\n/g, '\n').trim();

  const lines = [];
  lines.push('---');
  lines.push('subject: ' + yamlEscape_(subject));
  lines.push('from: ' + yamlEscape_(from));
  if (to) lines.push('to: ' + yamlEscape_(to));
  if (cc) lines.push('cc: ' + yamlEscape_(cc));
  lines.push('date: ' + yamlEscape_(dateStr));
  lines.push('message_id: ' + yamlEscape_(message.getId()));
  lines.push('---');
  lines.push('');
  lines.push('# ' + subject);
  lines.push('');
  lines.push('- **From:** ' + from);
  if (to) lines.push('- **To:** ' + to);
  lines.push('- **Date:** ' + dateStr);
  lines.push('');
  lines.push(body);
  lines.push('');

  return lines.join('\n');
}

/**
 * 重複しない安全なファイル名を生成する。
 * 形式: yyyy-MM-dd_件名_メッセージID.md
 */
function buildFileName_(message) {
  const tz = Session.getScriptTimeZone();
  const datePart = Utilities.formatDate(message.getDate(), tz, 'yyyy-MM-dd');
  const subject = (message.getSubject() || 'no-subject');

  // ファイル名に使えない文字・空白を整理し、長すぎる件名は切り詰める。
  let safeSubject = subject
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  if (safeSubject.length > 80) safeSubject = safeSubject.substring(0, 80);
  if (!safeSubject) safeSubject = 'no-subject';

  // メッセージ ID を付与して一意性を担保。
  return datePart + '_' + safeSubject + '_' + message.getId() + '.md';
}

/** 指定名のラベルを取得、無ければ作成して返す。 */
function getOrCreateLabel(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

/** 処理済みメッセージ ID の集合を Script Properties から読み込む。 */
function loadProcessedIds_() {
  const raw = PropertiesService.getScriptProperties().getProperty(PROCESSED_IDS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

/**
 * 処理済みメッセージ ID を保存する。
 * Script Properties の上限（約 500KB）対策として直近 5000 件に制限。
 */
function saveProcessedIds_(ids) {
  const keys = Object.keys(ids);
  let trimmed = ids;
  if (keys.length > 5000) {
    trimmed = {};
    keys.slice(keys.length - 5000).forEach(function (k) { trimmed[k] = true; });
  }
  PropertiesService.getScriptProperties()
    .setProperty(PROCESSED_IDS_KEY, JSON.stringify(trimmed));
}

/** Gmail 検索クエリ用にラベル名を整形（スペースをハイフンに）。 */
function toQueryLabel_(name) {
  // Gmail 検索では空白はハイフン扱い、ネストは "-" 連結が安全。
  return name.replace(/ /g, '-').replace(/\//g, '-');
}

/** YAML フロントマター用の簡易エスケープ。 */
function yamlEscape_(value) {
  return '"' + String(value).replace(/"/g, '\\"') + '"';
}

/**
 * 毎日 CONFIG.DAILY_HOUR 時に convertGmailToDrive を実行するトリガーを登録する。
 * 既存の同名トリガーは一度削除してから作り直すため、重複登録されません。
 */
function setupDailyTrigger() {
  removeDailyTrigger();
  ScriptApp.newTrigger('convertGmailToDrive')
    .timeBased()
    .everyDays(1)
    .atHour(CONFIG.DAILY_HOUR)
    .create();
  Logger.log('毎日 %s 時に実行するトリガーを登録しました。', CONFIG.DAILY_HOUR);
}

/** convertGmailToDrive の時刻トリガーをすべて削除する。 */
function removeDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'convertGmailToDrive') {
      ScriptApp.deleteTrigger(t);
    }
  });
}
