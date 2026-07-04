# -*- coding: utf-8 -*-
"""住所→緯度経度の変換（国土地理院 AddressSearch API・無料・APIキー不要）

- 結果は data/geocode_cache.csv にキャッシュし、2回目以降はAPIを呼ばない
- キャッシュの緯度・経度を手で書き換えれば、その値が優先される（位置の手動補正）
- 入力CSVに「緯度」「経度」列があればそれを最優先で使う
"""
import csv
import sys
import time
import urllib.parse
from pathlib import Path

import requests

from common import (COL_ADDR, COL_NAME, DATA_DIR, normalize_address,
                    read_csv_rows)

GSI_URL = "https://msearch.gsi.go.jp/address-search/AddressSearch?q={q}"
USER_AGENT = "hotel-benchmark-map/0.1 (GitHub Actions; internal benchmark material)"
CACHE_PATH = DATA_DIR / "geocode_cache.csv"


def load_cache():
    cache = {}
    if CACHE_PATH.exists():
        with open(CACHE_PATH, encoding="utf-8-sig") as f:
            for row in csv.DictReader(f):
                addr = (row.get("住所") or "").strip()
                lat, lon = (row.get("緯度") or "").strip(), (row.get("経度") or "").strip()
                if addr and lat and lon:
                    cache[addr] = (float(lat), float(lon), row.get("取得元") or "cache")
    return cache


def save_cache(cache):
    with open(CACHE_PATH, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["住所", "緯度", "経度", "取得元"])
        for addr, (lat, lon, src) in sorted(cache.items()):
            w.writerow([addr, f"{lat:.6f}", f"{lon:.6f}", src])


def gsi_geocode(session, query):
    url = GSI_URL.format(q=urllib.parse.quote(query))
    resp = session.get(url, timeout=20, headers={"User-Agent": USER_AGENT})
    resp.raise_for_status()
    results = resp.json()
    if not results:
        return None
    lon, lat = results[0]["geometry"]["coordinates"]
    return float(lat), float(lon)


def geocode_all(rows):
    cache = load_cache()
    session = requests.Session()
    n_api = 0
    for row in rows:
        # 1) 入力CSVに緯度経度が直接書かれていればそれを使う
        if row.get("緯度") and row.get("経度"):
            row["_lat"], row["_lon"], row["_geo_src"] = float(row["緯度"]), float(row["経度"]), "input"
            continue
        addr = normalize_address(row.get(COL_ADDR, ""))
        if not addr:
            row["_lat"] = row["_lon"] = None
            row["_geo_src"] = "no-address"
            continue
        # 2) キャッシュ
        if addr in cache:
            lat, lon, src = cache[addr]
            row["_lat"], row["_lon"], row["_geo_src"] = lat, lon, src
            continue
        # 3) 国土地理院API（丁寧に1秒間隔）
        if n_api:
            time.sleep(1.0)
        n_api += 1
        result = None
        for query in (addr, addr.rsplit("-", 1)[0] if "-" in addr else addr):
            try:
                result = gsi_geocode(session, query)
            except Exception as e:
                print(f"  [warn] API error for {query}: {e}", file=sys.stderr)
            if result:
                break
            time.sleep(1.0)
        if result:
            lat, lon = result
            cache[addr] = (lat, lon, "GSI")
            row["_lat"], row["_lon"], row["_geo_src"] = lat, lon, "GSI"
        else:
            row["_lat"] = row["_lon"] = None
            row["_geo_src"] = "not-found"
            print(f"  [warn] ジオコーディング失敗: {row.get(COL_NAME)} / {addr}", file=sys.stderr)
    save_cache(cache)
    return rows


def write_geocoded(rows, out_path):
    with open(out_path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["No", "施設名", "住所", "カテゴリー", "部屋数", "開業", "プライス・インデックス", "緯度", "経度", "取得元"])
        for i, row in enumerate(rows, 1):
            w.writerow([
                i, row.get("施設名", ""), row.get("住所", ""), row.get("カテゴリー", ""),
                row.get("部屋数", ""), row.get("開業", ""), row.get("プライス・インデックス", ""),
                f"{row['_lat']:.6f}" if row.get("_lat") else "",
                f"{row['_lon']:.6f}" if row.get("_lon") else "",
                row.get("_geo_src", ""),
            ])


def main(csv_path, out_path):
    rows = read_csv_rows(csv_path)
    print(f"入力: {len(rows)}件")
    rows = geocode_all(rows)
    ok = sum(1 for r in rows if r.get("_lat"))
    print(f"ジオコーディング成功: {ok}/{len(rows)}件")
    write_geocoded(rows, out_path)
    print(f"出力: {out_path}")
    return rows


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else str(DATA_DIR / "hotels.csv")
    dst = sys.argv[2] if len(sys.argv) > 2 else str(DATA_DIR.parent / "output" / "geocoded.csv")
    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    main(src, dst)
