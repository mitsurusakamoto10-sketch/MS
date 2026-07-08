# ベンチマークホテル・マップPPT自動生成ワークフロー

CSV（施設名・住所・カテゴリー・部屋数・開業・プライス・インデックス）から、
地図上にホテル位置をプロットした**編集可能なPowerPoint資料**を自動生成します。
すべて無料のサービス・ライブラリのみで動作します。

## 仕組み

```
data/hotels.csv（入力CSV）
   │ push または GitHub Actions の手動実行
   ▼
1. 開業年の古い順に自動ソート → ジオコーディング …… 国土地理院 AddressSearch API（無料・キー不要）
2. ベース地図生成 ……… OpenStreetMap タイル（無料・出典表記のみ必要）
3. PPTX組み立て ……… python-pptx（ピン・凡例・表は編集可能なシェイプ）
   ▼
output/YYYYMMDD_ベンチマークホテルマッピング_<マーケット名称>.pptx（自動でリポジトリにコミットされます）
```

ホテルの掲載順は常に**開業年の古い順**（手動での並べ替え不要）。マーケット名称はCSVに列を持たせず、実行のたびに明示的に指定します（Claude Codeスキル利用時はチャットで確認されます）。

## 使い方（GitHub Actions・推奨）

1. `data/hotels.csv` を新しいホテルリストで上書きし、`data/market.txt` にマーケット名称（1行）を書いて push する
   （Excelの場合は「CSV UTF-8」または「CSV」で保存。列名は
   `施設名,住所,カテゴリー,部屋数,開業,プライス・インデックス`）
2. Actions が自動実行され、数分後に `output/YYYYMMDD_ベンチマークホテルマッピング_<マーケット名称>.pptx` が生成される（`market.txt` が無い・空の場合はジョブがエラーで停止します）
3. GitHubの Actions タブ →「hotel-map」→ Run workflow でいつでも手動実行も可能（`market` 入力でその場で指定可）

### 位置がずれている場合の手動補正

`data/geocode_cache.csv` の該当住所の「緯度」「経度」を正しい値に書き換えて
push すると、次回からその値が使われます（APIより優先）。
Googleマップで地点を右クリックすると緯度経度をコピーできます。

### マーケット名の変更

ワークフローの実行時入力（Run workflow 時の `market`）または `data/market.txt`、
ローカル実行の `--market` で、スライド見出し・ファイル名のマーケット名を指定します。
`--market` は必須（省略するとエラー）で、既定値はありません。

## 使い方（手元PCでの実行）

```bash
pip install -r hotel-map/requirements.txt
python hotel-map/build.py --csv data/hotels.csv --market 軽井沢町
# → output/YYYYMMDD_ベンチマークホテルマッピング_軽井沢町.pptx
```

## ファイル構成

| ファイル | 役割 |
|---|---|
| `hotel-map/geocode.py` | 住所→緯度経度（国土地理院API＋キャッシュ） |
| `hotel-map/render_map.py` | OSMタイルからベース地図PNGを合成 |
| `hotel-map/make_pptx.py` | PPTX組み立て（ピンは編集可能シェイプ） |
| `hotel-map/build.py` | 上記3ステップの一括実行 |
| `data/hotels.csv` | 入力（ホテルリスト） |
| `data/geocode_cache.csv` | ジオコーディング結果キャッシュ（手動補正可） |
| `data/market.txt` | GitHub Actions用のマーケット名称受け渡しファイル（1行） |
| `output/` | 生成物（`{YYYYMMDD_ベンチマークホテルマッピング_マーケット名称}.pptx/.png/_geocoded.csv/_meta.json`） |

## 注意事項

- 地図画像には OSM の利用規約に基づき「© OpenStreetMap contributors」を表示しています。資料から削除しないでください
- Google Maps の地図画像は無料利用に制約があるため使用していません（見た目が近い OpenStreetMap を採用）
- 国土地理院APIの精度は概ね街区レベルです。番地レベルで数十mずれる場合は上記の手動補正を使ってください

## さらに詳しく

- **VSCodeでの実装・運用ガイド（詳細）**: [`docs/BMH_MAPPING.md`](../docs/BMH_MAPPING.md)
- **Claude Codeスキル**: このリポジトリでは `/bmh-mapping` で本ワークフローを起動できます（`.claude/skills/bmh-mapping/SKILL.md`）
