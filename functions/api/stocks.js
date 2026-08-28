// ============================================================
// 株価取得用 Cloudflare Pages Function
// ------------------------------------------------------------
// ブラウザから直接 Yahoo Finance を呼ぶと CORS で弾かれるため、
// サーバー側（この関数）で取得して JSON にまとめて返します。
// Yahoo がデータセンターIPを拒否した場合は Stooq (stooq.com) の
// 無料CSV APIへ自動フォールバックします。APIキーは不要です。
//
// 呼び出し: GET /api/stocks（&debug=1 で銘柄別の取得状況）
// ============================================================

// 表示する銘柄・指数（symbol は Yahoo、stooq は Stooq のコード）
const SYMBOLS = [
  { symbol: "8801.T", stooq: "8801.jp", name: "三井不動産" },
  { symbol: "8802.T", stooq: "8802.jp", name: "三菱地所" },
  { symbol: "^N225", stooq: "^nkx", name: "日経平均" },
  { symbol: "1343.T", stooq: "1343.jp", name: "東証REIT指数" }, // 東証REIT指数連動ETF(1343)
  { symbol: "^DJI", stooq: "^dji", name: "NYダウ" },
  { symbol: "^IXIC", stooq: "^ndq", name: "NASDAQ" },
  { symbol: "^GSPC", stooq: "^spx", name: "S&P500" },
  { symbol: "JPY=X", stooq: "usdjpy", name: "ドル円" },
];

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "ja,en;q=0.8",
};

function fetchWithTimeout(url, headers, ms) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { headers, signal: ctrl.signal }).finally(() => clearTimeout(to));
}

// Yahoo の chart エンドポイントから1銘柄分を取得
async function fetchYahoo(item, diag) {
  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
  for (const host of hosts) {
    try {
      const url =
        "https://" +
        host +
        "/v8/finance/chart/" +
        encodeURIComponent(item.symbol) +
        "?interval=1d&range=2d";
      const res = await fetchWithTimeout(url, BROWSER_HEADERS, 5000);
      if (!res.ok) {
        diag.push("yahoo:" + host + ":" + res.status);
        continue;
      }
      const data = await res.json();
      const meta =
        data && data.chart && data.chart.result && data.chart.result[0]
          ? data.chart.result[0].meta
          : null;
      if (!meta || meta.regularMarketPrice == null) {
        diag.push("yahoo:" + host + ":nometa");
        continue;
      }

      const price = meta.regularMarketPrice;
      const prev =
        meta.chartPreviousClose != null ? meta.chartPreviousClose : meta.previousClose;
      const change = prev != null ? price - prev : null;
      const changePct = change != null && prev ? (change / prev) * 100 : null;

      return {
        name: item.name,
        symbol: item.symbol,
        price,
        change,
        changePct,
        currency: meta.currency || "",
        ok: true,
        src: "yahoo",
      };
    } catch (e) {
      diag.push("yahoo:" + host + ":err");
    }
  }
  return null;
}

// Stooq の日足CSV（直近10日）から現値=最終終値・前日終値を取得
async function fetchStooq(item, diag) {
  if (!item.stooq) return null;
  try {
    const now = new Date();
    const d2 =
      now.getUTCFullYear() +
      String(now.getUTCMonth() + 1).padStart(2, "0") +
      String(now.getUTCDate()).padStart(2, "0");
    const past = new Date(now.getTime() - 14 * 86400000);
    const d1 =
      past.getUTCFullYear() +
      String(past.getUTCMonth() + 1).padStart(2, "0") +
      String(past.getUTCDate()).padStart(2, "0");
    const url =
      "https://stooq.com/q/d/l/?s=" +
      encodeURIComponent(item.stooq) +
      "&i=d&d1=" + d1 + "&d2=" + d2;
    const res = await fetchWithTimeout(url, BROWSER_HEADERS, 6000);
    if (!res.ok) {
      diag.push("stooq:" + res.status);
      return null;
    }
    const csv = (await res.text()).trim();
    // 形式: Date,Open,High,Low,Close,Volume（1行目ヘッダ）
    const lines = csv.split("\n").filter((l) => /^\d{4}-\d{2}-\d{2}/.test(l));
    if (lines.length < 1) {
      diag.push("stooq:empty");
      return null;
    }
    const closeOf = (line) => parseFloat(line.split(",")[4]);
    const price = closeOf(lines[lines.length - 1]);
    const prev = lines.length >= 2 ? closeOf(lines[lines.length - 2]) : null;
    if (!isFinite(price)) {
      diag.push("stooq:nan");
      return null;
    }
    const change = prev != null && isFinite(prev) ? price - prev : null;
    const changePct = change != null && prev ? (change / prev) * 100 : null;
    return {
      name: item.name,
      symbol: item.symbol,
      price,
      change,
      changePct,
      currency: item.stooq.endsWith(".jp") || item.stooq === "^nkx" ? "JPY" : "",
      ok: true,
      src: "stooq",
    };
  } catch (e) {
    diag.push("stooq:err");
    return null;
  }
}

async function fetchQuote(item, debugMap) {
  const diag = [];
  const q = (await fetchYahoo(item, diag)) || (await fetchStooq(item, diag));
  if (debugMap) debugMap[item.name] = { tries: diag, src: q ? q.src : null };
  return q || { name: item.name, symbol: item.symbol, ok: false };
}

export async function onRequest(context) {
  const debugOn =
    new URL(context.request.url).searchParams.get("debug") === "1";
  const debugMap = debugOn ? {} : null;
  const items = await Promise.all(SYMBOLS.map((s) => fetchQuote(s, debugMap)));
  const okCount = items.filter((i) => i.ok).length;

  const body = { updatedAt: new Date().toISOString(), items };
  if (debugOn) body.debug = debugMap;

  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // 30秒キャッシュ（全滅時はキャッシュせず次で再試行）
      "Cache-Control": debugOn || okCount === 0 ? "no-store" : "public, max-age=30",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
