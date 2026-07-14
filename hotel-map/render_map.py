# -*- coding: utf-8 -*-
"""OpenStreetMapタイルからベース地図PNGを生成する（マーカーは焼き込まない）

ピンはPowerPoint側で編集可能なシェイプとして載せるため、ここでは
地図画像と「緯度経度→画像内ピクセル」を復元できるメタ情報(JSON)のみ出力する。
出典表記「© OpenStreetMap contributors」を画像右下に描画する（利用規約）。
"""
import csv
import io
import json
import math
import sys
import time
from pathlib import Path

import requests
from PIL import Image, ImageDraw

from common import OUTPUT_DIR, lonlat_to_world, world_to_pixel

TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
USER_AGENT = "hotel-benchmark-map/0.1 (GitHub Actions; internal benchmark material)"
TILE_SIZE = 256
OUT_ASPECT = 8.0 / 6.2      # PPT地図枠(8.0in×6.2in)の縦横比。地図はこの比率で出力する
PAD_FRAC = 0.06            # 施設群の外側に付ける余白（bboxの大きい方の辺に対する割合）
MIN_PAD_PX = 60            # 施設が1点/近接のときの最小余白（選択ズームでのpx）
MAX_CANVAS_PX = 2200       # キャンバス幅の上限（これ以下で最大の整数ズームを選ぶ＝拡大優先）
MAX_ZOOM, MIN_ZOOM = 18, 5


def read_points(geocoded_csv):
    pts = []
    with open(geocoded_csv, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            if row.get("緯度") and row.get("経度"):
                pts.append((float(row["緯度"]), float(row["経度"])))
    if not pts:
        raise SystemExit("緯度経度のある行がありません。先に geocode.py を実行してください。")
    return pts


def choose_view(pts):
    """施設バウンディングボックスに合わせてズームとキャンバスを決める。

    余白過多を避けるため、固定キャンバスに整数ズームを合わせるのではなく、
    施設群のbbox＋余白を『枠いっぱい』に収める最大の整数ズームを選び、
    キャンバスサイズをそのbboxに合わせて切り出す。
    戻り値: (zoom, center_px_x, center_px_y, width_px, height_px)
    """
    ws = [lonlat_to_world(lon, lat) for lat, lon in pts]
    wx0, wx1 = min(w[0] for w in ws), max(w[0] for w in ws)
    wy0, wy1 = min(w[1] for w in ws), max(w[1] for w in ws)
    wcx, wcy = (wx0 + wx1) / 2, (wy0 + wy1) / 2

    for z in range(MAX_ZOOM, MIN_ZOOM - 1, -1):
        scale = TILE_SIZE * (2 ** z)
        span_x = (wx1 - wx0) * scale
        span_y = (wy1 - wy0) * scale
        pad = max(PAD_FRAC * max(span_x, span_y), MIN_PAD_PX)
        need_w = span_x + 2 * pad
        need_h = span_y + 2 * pad
        # 出力アスペクト比に合わせて短辺側を広げる
        canvas_w = max(need_w, need_h * OUT_ASPECT)
        canvas_h = canvas_w / OUT_ASPECT
        if canvas_w <= MAX_CANVAS_PX:
            cx, cy = wcx * scale, wcy * scale
            return z, cx, cy, int(round(canvas_w)), int(round(canvas_h))

    # 施設が広範囲すぎる場合は最小ズームで全体を収める
    z = MIN_ZOOM
    scale = TILE_SIZE * (2 ** z)
    span_x = (wx1 - wx0) * scale
    span_y = (wy1 - wy0) * scale
    pad = max(PAD_FRAC * max(span_x, span_y), MIN_PAD_PX)
    canvas_w = max(span_x + 2 * pad, (span_y + 2 * pad) * OUT_ASPECT)
    canvas_h = canvas_w / OUT_ASPECT
    return z, wcx * scale, wcy * scale, int(round(canvas_w)), int(round(canvas_h))


def fetch_tile(session, z, x, y):
    n = 2 ** z
    x %= n
    if y < 0 or y >= n:
        return Image.new("RGB", (TILE_SIZE, TILE_SIZE), "#dddddd")
    resp = session.get(TILE_URL.format(z=z, x=x, y=y), timeout=20,
                       headers={"User-Agent": USER_AGENT})
    resp.raise_for_status()
    return Image.open(io.BytesIO(resp.content)).convert("RGB")


def render(z, cx, cy, width, height):
    """中心ピクセル(cx,cy)・ズームzで width×height の地図を合成"""
    left, top = cx - width / 2, cy - height / 2
    tx0, ty0 = int(math.floor(left / TILE_SIZE)), int(math.floor(top / TILE_SIZE))
    tx1, ty1 = int(math.floor((left + width) / TILE_SIZE)), int(math.floor((top + height) / TILE_SIZE))
    n_tiles = (tx1 - tx0 + 1) * (ty1 - ty0 + 1)
    print(f"zoom={z}, canvas={width}x{height}, tiles={n_tiles}")
    img = Image.new("RGB", (width, height), "#eeeeee")
    session = requests.Session()
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            tile = fetch_tile(session, z, tx, ty)
            img.paste(tile, (int(tx * TILE_SIZE - left), int(ty * TILE_SIZE - top)))
            time.sleep(0.05)  # タイルサーバーへの配慮
    # 出典表記（OSM利用規約で必須）
    draw = ImageDraw.Draw(img, "RGBA")
    text = "(c) OpenStreetMap contributors"
    tw = draw.textlength(text) + 12
    draw.rectangle([width - tw, height - 20, width, height], fill=(255, 255, 255, 200))
    draw.text((width - tw + 6, height - 16), text, fill=(60, 60, 60))
    return img


def main(geocoded_csv, out_png, out_meta):
    pts = read_points(geocoded_csv)
    z, cx, cy, width, height = choose_view(pts)
    img = render(z, cx, cy, width, height)
    img.save(out_png)
    meta = {"zoom": z, "center_px_x": cx, "center_px_y": cy,
            "width_px": width, "height_px": height}
    Path(out_meta).write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"出力: {out_png}, {out_meta}")


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else str(OUTPUT_DIR / "geocoded.csv")
    png = sys.argv[2] if len(sys.argv) > 2 else str(OUTPUT_DIR / "map.png")
    meta = sys.argv[3] if len(sys.argv) > 3 else str(OUTPUT_DIR / "map_meta.json")
    Path(png).parent.mkdir(parents=True, exist_ok=True)
    main(src, png, meta)
