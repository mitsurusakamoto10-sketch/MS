# BMHマッピング ワークフロー実装ガイド（VSCode版）

ベンチマークホテル（BMH: Benchmark Hotel）の一覧CSVから、地図上に位置をプロットした
**編集可能なPowerPoint（PPTX）資料**を自動生成するワークフローの、設計と実装・運用の詳細。
VSCode上でローカル実行することを主眼に、GitHub Actionsでの自動化も併記する。

- 目的: 社内説明用に「指定マーケットにどのようなベンチマークホテルがどこに存在するか」を明示する資料を、**無料**の手段だけで作る
- 出力: `output/benchmark_hotels.pptx`（タイトル / 分布マップ / 詳細一覧の3スライド）
- Claude Codeでは `/bmh-mapping` スキル（`.claude/skills/bmh-mapping/SKILL.md`）からも起動できる

---

## 1. 全体アーキテクチャ

```
data/hotels.csv  （入力：施設名・住所・カテゴリー・部屋数・開業・プライスインデックス）
      │
      ▼  python hotel-map/build.py --csv data/hotels.csv --market "那覇市"
┌─────────────────────────────────────────────────────────────┐
│ ① geocode.py    住所 → 緯度経度                              │
│                 国土地理院 AddressSearch API（無料・キー不要）│
│                 結果を data/geocode_cache.csv にキャッシュ    │
│                 → output/geocoded.csv                        │
│                                                             │
│ ② render_map.py 緯度経度群 → ベース地図PNG                   │
│                 OpenStreetMap タイル（無料・出典表記が必要）  │
│                 施設bbox基準でズーム/画角を決定              │
│                 → output/map.png ＋ output/map_meta.json     │
│                                                             │
│ ③ make_pptx.py  地図PNG＋座標 → 編集可能PPTX                 │
│                 python-pptx。ピン・凡例・表はネイティブ図形  │
│                 → output/benchmark_hotels.pptx              │
└─────────────────────────────────────────────────────────────┘
```

各ステップは単体でも実行でき、`build.py` が順に呼び出すだけの薄いオーケストレーター。

---

## 2. なぜこの構成か（無料前提の設計判断）

| 論点 | 採用 | 理由 |
|---|---|---|
| ジオコーディング | 国土地理院 AddressSearch API | 無料・APIキー不要・商用可・日本の住所に強い |
| 地図画像 | OpenStreetMap タイル | 無料。出典表記のみで資料に埋め込める |
| Google Maps 画像 | **不採用** | Static Maps APIは課金、スクショは規約制約。見た目が近いOSMで代替 |
| PPTX生成 | python-pptx | ピン・表を**ネイティブ図形**として置け、PowerPointで編集可能 |
| 実行基盤 | ローカル/VSCode＋GitHub Actions | どちらも無料。API遮断環境ではActions経由で実行 |

---

## 3. フォルダ構成

```
リポジトリ/
├─ data/
│  ├─ hotels.csv          入力（ホテル一覧）
│  └─ geocode_cache.csv   住所→緯度経度キャッシュ（手動補正可・自動生成）
├─ hotel-map/
│  ├─ common.py           共通：CSV読込・住所正規化・Webメルカトル変換
│  ├─ geocode.py          ① ジオコーディング
│  ├─ render_map.py       ② OSM地図PNG生成
│  ├─ make_pptx.py        ③ PPTX組み立て
│  ├─ build.py            一括実行エントリポイント
│  ├─ requirements.txt    依存パッケージ
│  └─ README.md           簡易版の使い方
├─ output/                生成物（pptx / png / geocoded.csv / meta）
├─ docs/BMH_MAPPING.md    本書
└─ .github/workflows/hotel-map.yml  GitHub Actions定義
```

---

## 4. VSCodeでの環境構築

### 4.1 前提

- Python 3.11 以上
- 日本語フォント（地図PNGへの出典表記の描画に使用）
  - Windows: 標準で Meiryo/Yu Gothic あり
  - macOS: ヒラギノあり
  - Linux: `sudo apt install fonts-ipafont-gothic` 等（`ipag.ttf`）

### 4.2 セットアップ手順

```bash
# 1. リポジトリを取得
git clone <このリポジトリのURL>
cd <リポジトリ>

# 2. 仮想環境を作成・有効化
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# 3. 依存をインストール
pip install -r hotel-map/requirements.txt
```

`hotel-map/requirements.txt`:
```
requests>=2.31
Pillow>=10.0
python-pptx>=0.6.23
```

### 4.3 推奨するVSCode設定

- 拡張機能: **Python**（ms-python.python）
- インタプリタに `.venv` を選択（コマンドパレット → Python: Select Interpreter）

`.vscode/settings.json`（任意）:
```json
{
  "python.defaultInterpreterPath": "${workspaceFolder}/.venv/bin/python",
  "files.encoding": "utf8"
}
```

`.vscode/launch.json`（F5で実行できるようにする例）:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "BMH: build",
      "type": "debugpy",
      "request": "launch",
      "program": "${workspaceFolder}/hotel-map/build.py",
      "args": ["--csv", "data/hotels.csv", "--market", "那覇市"],
      "console": "integratedTerminal"
    }
  ]
}
```

---

## 5. 入力CSVの仕様

先頭行がヘッダー。想定する列（順不同・表記ゆれOK）:

| 列 | 例 | 必須 | 備考 |
|---|---|---|---|
| 施設名 | ホテル山の内 | ○ | 別名: ホテル名 / 名称 / ホテル名称 |
| 住所 | 〒900-0013 沖縄県那覇市牧志1丁目3-55 | ○ | 別名: 所在地 / 所在住所。郵便番号は自動除去 |
| カテゴリー | ビジネスホテル | 任意 | 別名: カテゴリ / タイプ |
| 部屋数 | 63 | 任意 | 別名: 客室数 |
| 開業 | 1973/1/1 | 任意 | 別名: 開業年 / 開業日。年のみ抽出して表示 |
| プライス・インデックス | 7,501 - 10,000 | 任意 | 別名: プライスインデックス / 価格帯 |
| 緯度 / 経度 | 26.2161 / 127.6875 | 任意 | あれば**APIより優先**（手入力で確実に位置指定） |

- 文字コードは **UTF-8（BOM可）と Shift-JIS を自動判別**（`common.read_csv_rows`）
- 施設名・住所がともに空の行はスキップ（Excel由来の大量の空行対策）
- Excelからは「CSV UTF-8」または「CSV」で保存

---

## 6. スクリプト詳細

### 6.1 `common.py` — 共通ユーティリティ

- `read_csv_rows(path)`: UTF-8-SIG/CP932を試行デコード→ヘッダーを別名辞書 `HEADER_ALIASES` で正規化→空行を除いた dict のリストを返す
- `normalize_address(addr)`: 郵便番号除去・NFKC正規化（全角→半角）・空白除去。ジオコーディング精度を上げる前処理
- `opening_year(value)`: `1973/1/1` → `1973年` のように年だけ取り出す
- `lonlat_to_world(lon, lat)` / `world_to_pixel(wx, wy, zoom)`: Webメルカトル（スリッピーマップ）座標変換。地図タイルとピン配置の座標系の基礎。ワールド座標(0..1)にズームzで `256 * 2^z` を掛けるとピクセル座標

### 6.2 `geocode.py` — ①住所→緯度経度

- 優先順位: **入力CSVの緯度経度列 > `data/geocode_cache.csv` のキャッシュ > 国土地理院API**
- API: `https://msearch.gsi.go.jp/address-search/AddressSearch?q=<住所>`（GeoJSON配列を返し、先頭の `geometry.coordinates` = [経度, 緯度]）
- サーバー配慮のため呼び出しは概ね1秒間隔。失敗時は末尾番地を落として再試行
- 出力 `output/geocoded.csv`（No・各列・緯度・経度・取得元）と、`data/geocode_cache.csv`（住所→緯度経度）
- **補正**: cacheの緯度経度を書き換えれば次回それが使われる

### 6.3 `render_map.py` — ②OSMベース地図PNG

要の関数 `choose_view(pts)`：**余白を減らすため、固定キャンバスに整数ズームを合わせるのではなく、施設バウンディングボックスに合わせてキャンバスを決める**。

1. 全施設のworld座標bboxと中心を求める
2. ズーム候補を高い方（`MAX_ZOOM=18`）から試し、`PAD_FRAC=0.15`（bboxの長辺の15%、最低 `MIN_PAD_PX=60`）の余白を付ける
3. 出力アスペクト比 `OUT_ASPECT = 8.0/6.2`（PPTの地図枠比）に合わせて短辺側を広げる
4. キャンバス幅が `MAX_CANVAS_PX=2200` 以下になる**最大ズーム**を採用（＝拡大優先。那覇の例ではzoom16）
5. `render()` がOSMタイルを合成し、右下に「© OpenStreetMap contributors」を描画（規約で必須）

出力: `output/map.png` と `output/map_meta.json`（zoom / center_px_x / center_px_y / width_px / height_px）。metaはピン配置の逆算に使う。

> タイルは `https://tile.openstreetmap.org/{z}/{x}/{y}.png`。大量取得は避け、User-Agentを付け、リクエスト間に小休止（実装済み）。

### 6.4 `make_pptx.py` — ③PPTX組み立て

- スライド1 タイトル：マーケット名・施設数・作成日・出典
- スライド2 分布マップ：`add_picture` で地図を貼り、`latlon_to_slide_inches()` で各施設の緯度経度を「地図画像内ピクセル→スライド上のインチ」に換算して**円形ピン（`add_pin`）**を配置。ピンは単色 `PIN_COLOR`。右に凡例テーブル（No/ホテル名/客室数/開業年）
- スライド3 詳細一覧：全項目のネイティブPPTテーブル
- 日本語フォントは `style_run()` が East Asian フォント（`JP_FONT="Meiryo"`）をXMLに直接設定
- `latlon_to_slide_inches` は `map_meta.json` の中心・サイズから逆算するので、`render_map` の画角と厳密に一致する

### 6.5 `build.py` — 一括実行

`--csv`（既定 `data/hotels.csv`）と `--market`（既定 `那覇市`）を受け、①→②→③を順に実行して `output/` に出力する薄いラッパー。

---

## 7. 実行方法

```bash
# 標準
python hotel-map/build.py --csv data/hotels.csv --market "那覇市"

# 個別実行（デバッグ時）
python hotel-map/geocode.py     data/hotels.csv        output/geocoded.csv
python hotel-map/render_map.py  output/geocoded.csv    output/map.png  output/map_meta.json
python hotel-map/make_pptx.py   output/geocoded.csv    output/map.png  output/map_meta.json  output/benchmark_hotels.pptx  "那覇市"
```

期待するログ（例）:
```
=== 1/3 ジオコーディング ===
入力: 11件
ジオコーディング成功: 11/11件
=== 2/3 地図生成 (OpenStreetMap) ===
zoom=16, canvas=1899x1472, tiles=...
=== 3/3 PPTX生成 ===
出力: output/benchmark_hotels.pptx（11施設）
完了
```

生成物: `output/benchmark_hotels.pptx` / `output/map.png` / `output/geocoded.csv` / `output/map_meta.json`

---

## 8. カスタマイズ早見表

| やりたいこと | 変更箇所 |
|---|---|
| マーケット名（見出し） | 実行時 `--market` |
| 地図をもっと寄せる / 引く | `render_map.py` `PAD_FRAC`（小さく=寄る） |
| 地図の解像度・最大ズーム | `render_map.py` `MAX_CANVAS_PX`（大きく=高精細・タイル増） |
| ピンの色 | `make_pptx.py` `PIN_COLOR` |
| ピンの大きさ | `make_pptx.py` `add_pin(..., diameter=...)` |
| 地図枠の位置・サイズ | `make_pptx.py` `MAP_LEFT/MAP_TOP/MAP_H_IN`＋`render_map.py` `OUT_ASPECT`（比率を一致させる） |
| フォント | `make_pptx.py` `JP_FONT` |
| スライドの文言・列 | `make_pptx.py` の各 `add_*_slide` |

---

## 9. ジオコーディングのズレを直す

1. `output/geocoded.csv` または資料でズレている施設を特定
2. Googleマップで正しい地点を右クリック → 表示された緯度経度をコピー
3. `data/geocode_cache.csv` の該当住所行の `緯度` `経度` を上書き（`取得元` は任意で `manual` 等に）
4. 再実行すると、その座標がAPIより優先して使われる

---

## 10. GitHub Actionsでの自動化

`.github/workflows/hotel-map.yml`:

- **トリガー**: `data/hotels.csv` / `hotel-map/**` の push、または `workflow_dispatch`（`market` 入力あり）
- **処理**: Python3.12セットアップ → `pip install` → `python hotel-map/build.py` → `output/` と `data/geocode_cache.csv` をコミットバック → 成果物を artifact としてもアップロード
- **用途**: 外部APIへ出られない環境（Claude Code on the web 等）や、CSVを置くだけで自動生成したい運用に有効
- 権限: `permissions: contents: write`（コミットバック用）

VSCodeでローカル実行する場合はActionsは不要。両者は同じ `build.py` を使うので出力は一致する。

---

## 11. トラブルシューティング

| 症状 | 原因 / 対処 |
|---|---|
| タイル取得やAPIが 403 / 接続不可 | 実行環境の外向きネットワークが遮断。→ GitHub Actions経由で実行 |
| 地図PNGの出典表記が □□□（豆腐） | 日本語フォント未導入。→ フォントを入れる（4.1）。※出典は英字なので通常は出る。ピン数字は英数字で影響なし |
| 施設ピンの位置が数十mズレる | 国土地理院APIは街区レベル精度。→ §9で手動補正 |
| `ジオコーディング成功: N/M` で欠けがある | 住所表記を確認。→ 該当行に `緯度` `経度` 列を直接記入して確実化 |
| PPTXのプレビューをCLIで見たい | LibreOfficeがあれば `soffice --headless --convert-to pdf output/benchmark_hotels.pptx`。無ければ `map.png` にピンを合成した確認用PNGを作る |
| `ModuleNotFoundError` | `.venv` 有効化と `pip install -r hotel-map/requirements.txt` を確認 |

---

## 12. ライセンス・順守事項

- 地図画像に「© OpenStreetMap contributors」を必ず表示する（`render_map.render` が自動描画。消さない）
- OSMタイルは大量・高頻度取得を避ける（本実装はリクエスト間に休止を入れている）
- 国土地理院APIの利用は各規約に従う
- Google Mapsの地図画像は本ワークフローでは使用しない（無料利用の規約・課金の制約回避）
