# -*- coding: utf-8 -*-
"""共通ユーティリティ: CSV読み込み・住所正規化・Webメルカトル座標変換"""
import csv
import math
import re
import unicodedata
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"
OUTPUT_DIR = REPO_ROOT / "output"

# 入力CSVの列名（この順序・名称を想定。多少の表記ゆれは normalize_header で吸収）
COL_NAME = "施設名"
COL_ADDR = "住所"
COL_CATEGORY = "カテゴリー"
COL_ROOMS = "部屋数"
COL_OPEN = "開業"
COL_PRICE = "プライス・インデックス"

HEADER_ALIASES = {
    "施設名": COL_NAME, "ホテル名": COL_NAME, "名称": COL_NAME, "ホテル名称": COL_NAME,
    "住所": COL_ADDR, "所在地": COL_ADDR, "所在住所": COL_ADDR,
    "カテゴリー": COL_CATEGORY, "カテゴリ": COL_CATEGORY, "タイプ": COL_CATEGORY,
    "部屋数": COL_ROOMS, "客室数": COL_ROOMS,
    "開業": COL_OPEN, "開業年": COL_OPEN, "開業日": COL_OPEN,
    "プライス・インデックス": COL_PRICE, "プライスインデックス": COL_PRICE, "価格帯": COL_PRICE,
    "緯度": "緯度", "経度": "経度",
}


def read_csv_rows(path):
    """UTF-8(BOM付含む)/Shift-JIS を自動判別してCSVを読み込み、空行を除いたdictのリストを返す"""
    raw = Path(path).read_bytes()
    for enc in ("utf-8-sig", "cp932"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise ValueError(f"CSVの文字コードを判別できません: {path}")

    reader = csv.reader(text.splitlines())
    rows = list(reader)
    if not rows:
        return []
    header = [HEADER_ALIASES.get(h.strip(), h.strip()) for h in rows[0]]
    out = []
    for r in rows[1:]:
        if not any(c.strip() for c in r):
            continue  # 全列空の行はスキップ
        d = {header[i]: (r[i].strip() if i < len(r) else "") for i in range(len(header))}
        if not d.get(COL_NAME) and not d.get(COL_ADDR):
            continue
        out.append(d)
    return out


def normalize_address(addr):
    """ジオコーディング用に住所を正規化: 郵便番号除去・全角英数を半角化・空白除去"""
    a = addr.strip()
    a = re.sub(r"〒?\s*\d{3}[-−ー]\d{4}\s*", "", a)
    a = unicodedata.normalize("NFKC", a)
    a = re.sub(r"[\s　]+", "", a)
    return a


def opening_year(value):
    """'1988/1/1' や '1988年' などから年を取り出して '1988年' 形式で返す"""
    m = re.search(r"(\d{4})", value or "")
    return f"{m.group(1)}年" if m else (value or "-")


def opening_sort_key(value):
    """開業日文字列から (年, 月, 日) の昇順ソートキーを作る。値が無ければ最後尾に回す"""
    nums = re.findall(r"\d+", value or "")
    if not nums:
        return (9999, 99, 99)
    y = int(nums[0])
    mo = int(nums[1]) if len(nums) > 1 else 1
    d = int(nums[2]) if len(nums) > 2 else 1
    return (y, mo, d)


def sanitize_filename(name):
    """ファイル名として使えない文字を除去・置換する"""
    s = unicodedata.normalize("NFKC", name or "").strip()
    s = re.sub(r'[\\/:*?"<>|]', "_", s)
    s = re.sub(r"\s+", "", s)
    return s or "マーケット未指定"


# --- Webメルカトル（スリッピーマップ）座標変換 ---

def lonlat_to_world(lon, lat):
    """経緯度 → ワールド座標(0..1)。zoom zでのピクセル座標は world * 256 * 2^z"""
    x = (lon + 180.0) / 360.0
    lat_rad = math.radians(lat)
    y = (1.0 - math.log(math.tan(lat_rad) + 1.0 / math.cos(lat_rad)) / math.pi) / 2.0
    return x, y


def world_to_pixel(wx, wy, zoom):
    scale = 256 * (2 ** zoom)
    return wx * scale, wy * scale
