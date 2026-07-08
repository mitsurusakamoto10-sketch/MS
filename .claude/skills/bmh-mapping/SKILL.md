---
name: bmh-mapping
description: ベンチマークホテル（BMH）を地図にプロットした編集可能なPPTX資料を、ホテル一覧CSV（施設名・住所・部屋数・開業年など）から無料で自動生成する。「ベンチマークホテル」「BMH」「競合ホテルを地図にプロット」「指定マーケットのホテル分布資料」「ホテル一覧CSVからパワポ／PPTX」「ホテルマッピング」といった依頼で使う。住所→緯度経度（国土地理院API）→OpenStreetMap地図→python-pptxで組み立てる。
---

# BMH（ベンチマークホテル）マッピング

指定マーケットのベンチマークホテルが地図上のどこに存在するかを明示する、社内説明用の**編集可能なPPTX資料**をCSVから自動生成するワークフロー。すべて無料のサービス・ライブラリのみで動く。

- 実装本体は `hotel-map/`（common.py / geocode.py / render_map.py / make_pptx.py / build.py）。このスキルはそれを呼び出す手順書。**新しいコードは基本書かず、既存スクリプトを再利用する。**
- 詳細な設計・VSCodeでの実装手順は `docs/BMH_MAPPING.md` を参照。

## 処理の流れ

```
data/hotels.csv → (0)マーケット名称をチャットで確認
              → (1)開業年の古い順にソート → (2)住所→緯度経度(国土地理院API)
              → (3)OSMタイルでベース地図PNG → (4)python-pptxで編集可能PPTX(番号ピン・凡例・詳細表)
              → output/YYYYMMDD_ベンチマークホテルマッピング_<マーケット名称>.pptx
```

## 手順

1. **前提を確認**
   - Python 3.11+、`pip install -r hotel-map/requirements.txt`（requests / Pillow / python-pptx）
   - 日本語フォント（Linuxなら IPAGothic 等）。無いとPNG上の出典表記が豆腐になる

2. **マーケット名称をチャットでユーザーに確認する**
   - CSVにマーケット名の列は無い前提。**必ずチャットで「マーケット名称は何ですか」を確認**し、その回答を使う（ユーザーが最初の依頼で明示していれば再確認不要）
   - 確認した名称はファイル名にも使われる（下記）

3. **入力CSVを `data/hotels.csv` に配置**
   - 想定列: `施設名, 住所, カテゴリー, 部屋数, 開業, プライス・インデックス`
   - 列名の表記ゆれ（ホテル名／所在地／客室数／開業年 等）・Shift-JIS・空行は `common.read_csv_rows` が吸収する
   - 住所に緯度経度を直接持たせたい場合は `緯度` `経度` 列を足すと最優先で使われる
   - **掲載順は開業年の古い順に自動でソートされる**（`geocode.py` が `common.opening_sort_key` でソート）。手動での並べ替えは不要

4. **生成を実行**
   - ローカル / VSCode: `python hotel-map/build.py --csv data/hotels.csv --market "<確認したマーケット名称>"`（`--market` は必須。省略するとエラーになる）
   - Claude Code on the web など外部API遮断環境: 確認したマーケット名称を `data/market.txt` に1行で書いて `data/hotels.csv` と一緒に push すると `.github/workflows/hotel-map.yml` が実行され `output/` をコミットバックする。手動起動は Actions → hotel-map → Run workflow（`market` 入力可。未指定なら `data/market.txt` を使用）
   - 実行環境から外部ネットワーク（国土地理院API・OSMタイル）に出られるかを先に確認する。遮断されていればGitHub Actions経路を使う

5. **成果物を確認して届ける**
   - 生成物は `output/YYYYMMDD_ベンチマークホテルマッピング_<マーケット名称>.pptx`（YYYYMMDDは生成日、3スライド: タイトル / 分布マップ / 詳細一覧）。同じ命名の `.png`（地図画像）・`_geocoded.csv`・`_meta.json` も同時に出力される
   - ファイル名に使えない文字（`/ \ : * ? " < > |` や空白）は自動的に置換される（`common.sanitize_filename`）
   - ピン・凡例・表はすべてPowerPointのネイティブ図形＝編集可能。ホテル名・客室数・開業年を必ず記載
   - ユーザーへは PPTX を送付し、マップは目視確認用にプレビューPNG（生成された地図PNGにピンを合成）を添えるとよい

6. **位置ズレの補正**
   - `data/geocode_cache.csv` の該当住所の `緯度`/`経度` を正しい値に書き換えて再実行すると、その値がAPIより優先される
   - Googleマップで地点を右クリックすると緯度経度をコピーできる

## 主なカスタマイズ点

| 目的 | 変更箇所 |
|---|---|
| マーケット名（見出し・ファイル名） | `build.py --market`（チャットで確認した値を渡す） |
| 掲載順の基準列 | `common.COL_OPEN`／並び替えロジックは `common.opening_sort_key` |
| 地図の余白（寄せ／引き） | `render_map.py` の `PAD_FRAC`（既定0.15）|
| 地図の解像度・ズーム上限 | `render_map.py` の `MAX_CANVAS_PX`（既定2200）|
| ピンの色 | `make_pptx.py` の `PIN_COLOR` |
| 地図枠のサイズ／比率 | `make_pptx.py` の `MAP_LEFT/MAP_TOP/MAP_H_IN` と `render_map.py` の `OUT_ASPECT` |
| フォント | `make_pptx.py` の `JP_FONT`（既定 Meiryo）|

## 順守事項（無料・ライセンス）

- 地図画像には「© OpenStreetMap contributors」を必ず表示（`render_map.render` が描画）。削除しない
- Google Mapsの地図画像は無料利用に規約・課金の制約があるため使わない（見た目が近いOSMを採用）
- 国土地理院APIは概ね街区レベル精度。番地でズレたら上記の手動補正を使う
