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
MAP_W, MAP_H = 1660, 1330   # PPT上の地図エリア(約8.3in×6.65in @200dpi)に合わせた縦横比
MARGIN_PX = 110             # 端のピンが切れないよう余白を確保
MAX_ZOOM, MIN_ZOOM = 17, 5


def read_points(geocoded_csv):
    pts = []
    with open(geocoded_csv, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            if row.get("緯度") and row.get("経度"):
                pts.append((float(row["緯度"]), float(row["経度"])))
    if not pts:
        raise SystemExit("緯度経度のある行がありません。先に geocode.py を実行してください。")
    return pts


def choose_zoom(pts):
    """全ポイントが余白込みで画像に収まる最大ズームを選ぶ"""
    ws = [lonlat_to_world(lon, lat) for lat, lon in pts]
    for z in range(MAX_ZOOM, MIN_ZOOM - 1, -1):
        xs = [world_to_pixel(wx, wy, z)[0] for wx, wy in ws]
        ys = [world_to_pixel(wx, wy, z)[1] for wx, wy in ws]
        if (max(xs) - min(xs)) <= MAP_W - 2 * MARGIN_PX and (max(ys) - min(ys)) <= MAP_H - 2 * MARGIN_PX:
            return z, (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    z = MIN_ZOOM
    xs = [world_to_pixel(wx, wy, z)[0] for wx, wy in ws]
    ys = [world_to_pixel(wx, wy, z)[1] for wx, wy in ws]
    return z, (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2


def fetch_tile(session, z, x, y):
    n = 2 ** z
    x %= n
    if y < 0 or y >= n:
        return Image.new("RGB", (TILE_SIZE, TILE_SIZE), "#dddddd")
    resp = session.get(TILE_URL.format(z=z, x=x, y=y), timeout=20,
                       headers={"User-Agent": USER_AGENT})
    resp.raise_for_status()
    return Image.open(io.BytesIO(resp.content)).convert("RGB")


def render(z, cx, cy):
    """中心ピクセル(cx,cy)・ズームzでMAP_W×MAP_Hの地図を合成"""
    left, top = cx - MAP_W / 2, cy - MAP_H / 2
    tx0, ty0 = int(math.floor(left / TILE_SIZE)), int(math.floor(top / TILE_SIZE))
    tx1, ty1 = int(math.floor((left + MAP_W) / TILE_SIZE)), int(math.floor((top + MAP_H) / TILE_SIZE))
    n_tiles = (tx1 - tx0 + 1) * (ty1 - ty0 + 1)
    print(f"zoom={z}, tiles={n_tiles}")
    img = Image.new("RGB", (MAP_W, MAP_H), "#eeeeee")
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
    draw.rectangle([MAP_W - tw, MAP_H - 20, MAP_W, MAP_H], fill=(255, 255, 255, 200))
    draw.text((MAP_W - tw + 6, MAP_H - 16), text, fill=(60, 60, 60))
    return img


def main(geocoded_csv, out_png, out_meta):
    pts = read_points(geocoded_csv)
    z, cx, cy = choose_zoom(pts)
    img = render(z, cx, cy)
    img.save(out_png)
    meta = {"zoom": z, "center_px_x": cx, "center_px_y": cy,
            "width_px": MAP_W, "height_px": MAP_H}
    Path(out_meta).write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"出力: {out_png}, {out_meta}")


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else str(OUTPUT_DIR / "geocoded.csv")
    png = sys.argv[2] if len(sys.argv) > 2 else str(OUTPUT_DIR / "map.png")
    meta = sys.argv[3] if len(sys.argv) > 3 else str(OUTPUT_DIR / "map_meta.json")
    Path(png).parent.mkdir(parents=True, exist_ok=True)
    main(src, png, meta)
