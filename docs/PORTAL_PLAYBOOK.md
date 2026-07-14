# マイポータル 構築プレイブック（再現・アレンジ用）

このドキュメントは、社員ポータルサイト（Myworkportal）を**別メンバー向けに少しアレンジして新規構築する**ための設計書兼手順書です。新しいClaudeセッションにこのファイルを渡せば、ゼロから同等のサイトを再現・カスタマイズできます。

---

## 0. このサイトは何か

- **静的サイト（HTML/CSS/JS）＋ Cloudflare Pages Functions**（サーバーレスAPI）で構成された個人向け業務ポータル。
- ビルド不要。`index.html` をそのまま配信。動的データは `functions/api/*.js` がサーバー側で外部APIを叩いて返す。
- **GitHub → Cloudflare Pages 自動デプロイ**（main へ push すると自動公開）。
- 不動産・ホテル業界の担当者向けに、**競合動向・適時開示・業界ニュース・株価・天気・MLB** を一画面に集約。

---

## 1. 技術構成

```
index.html     … ページ骨組み（ヘッダー＋各セクション）
style.css      … デザイン（:root のCSS変数でカラースキーム一括管理）
script.js      … 各セクションのデータ取得・描画・更新ボタン・自動更新
functions/api/ … Cloudflare Pages Functions（各データソースの中継）
  competitors.js … 競合各社のプレスリリース（自社RSS優先＋PR TIMES/Bing補完）
  tdnet.js       … 上場REITの物件取引開示（適時開示TDnet / やのしんWebAPI）
  release.js     … 業界リリース情報（Gemini + Google検索グラウンディング）
  hotelbank.js   … HotelBank最新ニュース（HTMLスクレイピング＋Gemini重要度判定）
  feed.js        … 日経不動産マーケット / NewsPicks の見出し（公開ページ取得）
  stocks.js      … 株価バー
  mlb.js         … MLBドジャース速報
```

### デプロイ / 動作環境
- Cloudflare Pages（プロジェクト名例: myworkportal）。Production branch = `main`、Automatic deployments = Enabled。
- ビルドコマンド：空欄、出力ディレクトリ：`/`（ルート）。
- **環境変数（Cloudflare → Settings → Variables and secrets）**
  - `GEMINI_API_KEY`（必須・Secret）… Google AI Studio の無料キー。release.js と hotelbank.js が使用。
  - ※`EDINET_API_KEY` は旧REIT実装で使用していたが、**TDnet移行により現在は不要**。
  - **重要**：環境変数は登録しただけでは反映されない。**保存後に必ず再デプロイ**（Deployments → Retry deployment、または main へ push）すること。

---

## 2. 画面セクション一覧とデータソース

| セクション | Function | データソース | 認証 | 更新 |
|---|---|---|---|---|
| 株価バー | stocks.js | 株価API | 不要 | 約60秒 |
| 天気 + MLB | （天気は内蔵）/ mlb.js | 気象API / MLB Stats API | 不要 | 10分 / 5分 |
| 競合リリース | competitors.js | 自社RSS＋PR TIMES＋Bing News | 不要 | 毎朝8時+手動 |
| リリース（各社リンク） | （静的リンクチップ） | 各社ニュースページURL | — | — |
| 日経不動産マーケット | feed.js?src=nfm | 公開トップのHTML | 不要 | 30分 |
| 業界リリース情報（AI調べ） | release.js | Gemini 2.5 Flash + Google検索 | GEMINI_API_KEY | 毎朝8時+手動 |
| HotelBank最新ニュース | hotelbank.js | hotelbank.jp HTML + Gemini | GEMINI_API_KEY | 毎朝8時+手動 |
| NewsPicks注目 | feed.js?src=newspicks | 公開トップのHTML | 不要 | 30分 |
| 上場REIT 物件取引開示 | tdnet.js | やのしんTDnet WebAPI | 不要 | 毎朝8時+手動 |

---

## 3. 重要な技術判断・ハマりどころ（学びの記録）

新規構築時に同じ轍を踏まないための要点。**ここが本ドキュメントの核心**。

### 3-1. データソースの選定
- **EDINET ≠ 物件取引開示**：EDINETは「有報・臨時報告書」等の法定開示専用。**物件の取得・売却・賃貸借の「お知らせ」はTDnet（適時開示）にしか出ない**。REITの物件取引を追うなら **TDnet** が正解。
- **TDnetの取得**：公式 release.tdnet.info は31日保持だがHTMLが重い。**やのしんTDnet WebAPI**（`https://webapi.yanoshin.jp/webapi/tdnet/list/...json`、無料・認証不要）が扱いやすい。
  - 日別取得：`list/YYYYMMDD.json?limit=500`（`limit=1000`は504タイムアウトするので**500**にする）。
  - 1日の適時開示はピークでも数百件。30日分を**6並列バッチ＋8秒タイムアウト＋リトライ**で取得。
  - 社名は略称で「投資法人」を含まないことが多く、**REIT銘柄は全角「Ｒ－」始まり**。REIT判定は「社名に投資法人を含む or 先頭が全角Ｒ(0xFF32) or REIT表記」。カタカナ「リート」は『アクリート』等で誤検出するため**使わない**。
  - 物件判定は「**動作（取得/譲渡/売却/賃貸借…）＋ 対象（不動産/信託受益権/底地/資産…）の両方**」を題名に含むこと（自己株式・借入等のノイズ除去）。
- **競合の公式リリース**：大手不動産サイトは**CDNのBot対策で403**になる社が多い（三井・三菱・野村等）。本番エッジからの取得可否は**実測でしか分からない**。
  - 取得できる社：自社サイトRSS（住友 `/news/feed/`、東京建物 `/news/rss/news.php`、東急 `/news/others/rss`）。
  - 取れない社：**PR TIMES企業別RSS**（`https://prtimes.jp/companyrdf.php?company_id=ID`）で補完。
  - PR TIMESにも無い/手薄な社：**Bing News RSS**（`https://www.bing.com/news/search?q=...&format=rss`）で補完。※**Google NewsはデータセンターIPだと同意画面リダイレクトで取得不可**だった。
  - 方式は「各社ごとに候補ソースを順に試し、最初に取れたものを採用」する設計（competitors.js）。

### 3-2. キャッシュの罠（最頻出のハマり）
- Pages Functions の成功レスポンスに `Cache-Control: public, max-age=...`（毎朝8時まで）を付けてエッジキャッシュ。
- **検証時は同じURLだと古いキャッシュが返る**。`?debug=1&x=毎回違う値` でキャッシュ回避すること。
- **診断系（?debug / ?dump）は `Cache-Control: no-store`** を付けて常に最新に。
- **空・失敗レスポンスはキャッシュしない**（no-store）。空をキャッシュすると次の更新まで空のまま。
- 外部API一時不調対策に **last-good キャッシュ**（Cloudflare Cache API で直近の成功結果を保存し、失敗時はそれを返す）を実装すると「間違いなく表示」が保てる（tdnet.js 参照）。

### 3-3. AIモデル（Gemini）
- 「AI調べ（業界リリース）」は **Gemini + Google検索グラウンディング**（`tools:[{google_search:{}}]`）。
- **無料を優先**するなら現状 `gemini-2.5-flash`。`gemini-3-flash-preview` はモデルIDは有効だが、**無料キーではグラウンディング付きが429（クォータ/課金）**で使えない（課金設定すれば月5,000回無料）。
- プロンプトには**実行時の現在日時(JST)を必ず埋め込む**こと。相対表現「直近24時間」だけだと古い情報を返す。
- 失敗時に従来モデルへ自動フォールバックする多段構成にすると堅牢。

### 3-4. UI/見せ方
- カラースキームは `style.css` の `:root` 変数を変えるだけで一括変更（現状は「シャープなクール基調＋鮮明ブルー」）。
- 件数が多いセクションは `max-height + overflow-y:auto` で「最新N件表示＋残りスクロール」。
- 各データセクションに**手動「↻更新」ボタン**（`setupRefreshButton` 共通関数）＋**毎朝8時自動更新**（`scheduleDailyAt8`）。
- 横に長いチップ行は `flex-wrap:nowrap + overflow-x:auto`（または小型化）で1行維持。

---

## 4. 別メンバー向けカスタマイズ箇所

「若干アレンジ」で変えやすいポイント。新セッションでは**ここを差し替える**よう指示すればよい。

1. **ブランド名/タイトル**：`index.html` の `.brand`、`<title>`。
2. **カラースキーム**：`style.css` の `:root` 変数（背景・アクセント色など）。メンバーごとに色変えで個性を。
3. **競合他社セット**：`competitors.js` の `COMPANIES`（社名・PR TIMES company_id・自社RSS/Bing）と、`index.html` の「リリース」チップ群・`thumb-sub` の対象社名。
   - PR TIMES company_id は `prtimes.jp/main/html/searchrlp/company_id/XXXXX` で確認。
4. **株価銘柄**：stocks.js の対象ティッカー。
5. **天気の地域**：天気セクションの都道府県デフォルト。
6. **業界AI調べのテーマ**：release.js の `buildPrompt()`（観点・情報源・除外条件）。担当業界に合わせて文面を差し替え。
7. **業界専門メディア**：hotelbank.js（別業界なら別メディアのスクレイピングに置換）、feed.js の SOURCES。
8. **REIT/適時開示の対象**：tdnet.js の `PROPERTY_KEYWORDS`/`ESTATE_KEYWORDS`、`DAYS`（期間）、表示件数。
9. **趣味枠**：mlb.js（別チーム/別スポーツ/別ジャンルに置換可）。
10. **表示件数・スクロール**：style.css の各 `#xxx-grid` の `max-height`。

---

## 5. 新規サイト作成の手順（ステップ）

### STEP 1：土台の準備
1. 新しいGitHubリポジトリを作成（例：`myworkportal-membername`）。本リポジトリの `index.html / style.css / script.js / functions/ / README.md / docs/` を**コピー**して初期コミット。
2. Cloudflare Pages で新プロジェクトを作成し、そのリポジトリを接続（ビルドコマンド空欄／出力 `/`／Production branch = main）。
3. 環境変数 `GEMINI_API_KEY` を登録（Production/Preview両方）→ **再デプロイ**。

### STEP 2：新セッションでこのMDを渡す
新しいClaudeセッションを開き、最初のメッセージで：
- 本ファイル `docs/PORTAL_PLAYBOOK.md` を共有（リポジトリに入っていれば「このリポジトリの docs/PORTAL_PLAYBOOK.md を読んで」でOK）。
- 「このプレイブックに沿って、◯◯さん向けにアレンジしたポータルを作る。まず**第4章のカスタマイズ項目をどう変えるか**を一緒に決めたい」と伝える。

### STEP 3：カスタマイズ内容を確定（第4章に沿って）
- ブランド名／カラー／競合他社セット／株価銘柄／地域／AI調べテーマ／業界メディア／趣味枠 を一つずつ決定。
- 競合を変える場合は**各社のPR TIMES company_id と自社RSSの実在**を先に確認（Claudeに調べてもらう）。

### STEP 4：実装と検証（1機能ずつ）
- 1セクションずつ変更 → main へ push → デプロイ → **`/api/xxx?debug=1&x=ランダム値`** で実データ確認 → トップページ Ctrl+F5。
- 外部API依存（TDnet/PR TIMES/Bing/Gemini）は**まずFunctionの `?debug` で取得可否と件数を実測**してからUI接続する（机上で決めない）。

### STEP 5：仕上げ
- 不要な検証用エンドポイント/コードを削除。
- last-good キャッシュ等の堅牢化を確認。
- 表示件数・スクロール・色を最終調整。

---

## 6. 検証コマンド早見表

```
# 取得可否・件数（キャッシュ回避で x を毎回変える）
https://<site>/api/tdnet?debug=1&x=1         # REIT物件取引：日別取得状況・件数
https://<site>/api/tdnet?dump=1              # 全社の物件取引お知らせ一覧（社名/コード/REIT判定）
https://<site>/api/competitors?debug=1&x=1   # 競合各社：採用ソース・直近件数
https://<site>/api/release?debug=1&x=1       # AI調べ：採用モデル・件数
https://<site>/api/hotelbank?debug=1&x=1     # HotelBank：取得ページ・件数
```

---

## 7. つまずいたら（チェックリスト）

- セクションが空 → `?debug=1&x=新しい値` で実データ確認。`days`/`status`/`hits` を見る。
- 古い内容のまま → キャッシュ。`x=` を変える／`?fresh=`／Ctrl+F5／再デプロイ。
- 環境変数が効かない → **保存後に再デプロイしたか**。変数名のスペル一致。Production側に登録したか。
- 外部APIが504/403 → limitを下げる（TDnet）/ Bot対策（自社サイト）→ 代替ソースへ。並列数を下げる。
- AIが古い情報 → プロンプトに現在日時(JST)を埋め込む。
