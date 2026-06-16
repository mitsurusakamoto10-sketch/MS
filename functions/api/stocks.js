// ============================================================
// 株価取得用 Cloudflare Pages Function
// ------------------------------------------------------------
// ブラウザから直接 Yahoo Finance を呼ぶと CORS で弾かれるため、
// サーバー側（この関数）で取得して JSON にまとめて返します。
// APIキーは不要です（機密情報は持ちません）。
//
// 呼び出し: GET /api/stocks
// ============================================================

// 表示する銘柄・指数（name は画面表示名、symbol は Yahoo のコード）
const SYMBOLS = [
  { symbol: "8801.T", name: "三井不動産" },
  { symbol: "8802.T", name: "三菱地所" },
  { symbol: "8830.T", name: "住友不動産" },
  { symbol: "^N225", name: "日経平均" },
  { symbol: "1343.T", name: "東証REIT指数" }, // 東証REIT指数連動ETF(1343)
  { symbol: "^DJI", name: "NYダウ" },
  { symbol: "^IXIC", name: "NASDAQ" },
  { symbol: "^GSPC", name: "S&P500" },
  { symbol: "JPY=X", name: "ドル円" },
];

// Yahoo の chart エンドポイントから1銘柄分を取得
async function fetchQuote(item) {
  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
  for (const host of hosts) {
    try {
      const url =
        "https://" +
        host +
        "/v8/finance/chart/" +
        encodeURIComponent(item.symbol) +
        "?interval=1d&range=2d";
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "application/json",
        },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const meta = data && data.chart && data.chart.result && data.chart.result[0]
        ? data.chart.result[0].meta
        : null;
      if (!meta || meta.regularMarketPrice == null) continue;

      const price = meta.regularMarketPrice;
      const prev =
        meta.chartPreviousClose != null
          ? meta.chartPreviousClose
          : meta.previousClose;
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
      };
    } catch (e) {
      // 次のホストで再試行
    }
  }
  return { name: item.name, symbol: item.symbol, ok: false };
}

export async function onRequest() {
  const items = await Promise.all(SYMBOLS.map(fetchQuote));

  return new Response(
    JSON.stringify({ updatedAt: new Date().toISOString(), items }),
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        // 30秒間はエッジ/ブラウザのキャッシュを許可（Yahooへの負荷軽減）
        "Cache-Control": "public, max-age=30",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}
