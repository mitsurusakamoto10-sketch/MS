# -*- coding: utf-8 -*-
"""ベンチマークホテル・マップPPT生成の一括実行エントリポイント

使い方:
    python hotel-map/build.py [--csv data/hotels.csv] [--market 那覇市]
"""
import argparse
import datetime
from pathlib import Path

import geocode
import make_pptx
import render_map
from common import DATA_DIR, OUTPUT_DIR


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default=str(DATA_DIR / "hotels.csv"), help="入力CSV")
    ap.add_argument("--market", default="那覇市", help="マーケット名（スライド見出しに使用）")
    ap.add_argument("--outdir", default=str(OUTPUT_DIR))
    args = ap.parse_args()

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    geocoded = outdir / "geocoded.csv"
    map_png = outdir / "map.png"
    map_meta = outdir / "map_meta.json"
    pptx = outdir / "benchmark_hotels.pptx"

    print("=== 1/3 ジオコーディング ===")
    geocode.main(args.csv, str(geocoded))
    print("=== 2/3 地図生成 (OpenStreetMap) ===")
    render_map.main(str(geocoded), str(map_png), str(map_meta))
    print("=== 3/3 PPTX生成 ===")
    make_pptx.main(str(geocoded), str(map_png), str(map_meta), str(pptx),
                   args.market, datetime.date.today().isoformat())
    print("完了")


if __name__ == "__main__":
    main()
