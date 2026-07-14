# -*- coding: utf-8 -*-
"""ベンチマークホテル・マップPPT生成の一括実行エントリポイント

使い方:
    python hotel-map/build.py --csv data/hotels.csv --market 那覇市

マーケット名称はCSVからは読み取らず、実行者（Claude Codeスキル経由の場合は
チャットでユーザーに確認した値）が --market で明示的に渡す。
生成物は YYYYMMDD_ベンチマークホテルマッピング_<マーケット名称> の名前で
output/ に出力される（YYYYMMDDは生成日）。
"""
import argparse
import datetime
from pathlib import Path

import geocode
import make_pptx
import render_map
from common import DATA_DIR, OUTPUT_DIR, sanitize_filename


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default=str(DATA_DIR / "hotels.csv"), help="入力CSV")
    ap.add_argument("--market", required=True,
                    help="マーケット名称（チャット等でユーザーに確認した値。CSVからは読まない）")
    ap.add_argument("--outdir", default=str(OUTPUT_DIR))
    args = ap.parse_args()

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    today = datetime.date.today()
    stem = f"{today:%Y%m%d}_ベンチマークホテルマッピング_{sanitize_filename(args.market)}"
    geocoded = outdir / f"{stem}_geocoded.csv"
    map_png = outdir / f"{stem}.png"
    map_meta = outdir / f"{stem}_meta.json"
    pptx = outdir / f"{stem}.pptx"

    print("=== 1/3 ジオコーディング ===")
    geocode.main(args.csv, str(geocoded))
    print("=== 2/3 地図生成 (OpenStreetMap) ===")
    render_map.main(str(geocoded), str(map_png), str(map_meta))
    print("=== 3/3 PPTX生成 ===")
    make_pptx.main(str(geocoded), str(map_png), str(map_meta), str(pptx),
                   args.market, today.isoformat())
    print(f"完了: {pptx}")


if __name__ == "__main__":
    main()
