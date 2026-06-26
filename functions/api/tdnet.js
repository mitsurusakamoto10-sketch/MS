// ============================================================
// 上場REIT 物件取引開示 取得 Function（TDnet 適時開示）
// ------------------------------------------------------------
// やのしんTDnet WebAPI から直近N日の適時開示を取得し、提出者が
// 「投資法人(REIT)」かつ題名が物件の取得・売却・賃貸借に関するものを
// 抽出して返します。EDINETに出ない「資産の取得に関するお知らせ」等は
// TDnetにあるため、こちらを情報源にします。
//
// 呼び出し: GET /api/tdnet
//   &fresh=... でキャッシュ回避、&debug=1 で日別取得状況、
//   &dump=1 で投資法人の全開示（題名付き・フィルタ前）を返す。
// ============================================================

const DAYS = 30;
const PER_DAY_LIMIT = 1000;

// 物件の取得・売却・賃貸借に関する開示のキーワード（TDnet題名向け）
const PROPERTY_KEYWORDS = [
  "取得",
  "売却",
  "譲渡",
  "処分",
  "賃貸借",
  "賃貸",
  "貸借", // 「取得及び貸借」等
  "リース",
  "信託受益権",
];

function isPropertyDeal(desc) {
  if (!desc) return false;
  return PROPERTY_KEYWORDS.some((kw) => desc.indexOf(kw) >= 0);
}

function pad(n) {
  return n < 10 ? "0" + n : "" + n;
}
// YYYYMMDD（TDnet API用）
function ymd(d) {
  return "" + d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate());
}

function secondsUntilNext8amJST() {
  const nowJst = new Date(Date.now() + 9 * 3600000);
  const next = new Date(nowJst);
  next.setUTCHours(8, 0, 0, 0);
  if (next <= nowJst) next.setUTCDate(next.getUTCDate() + 1);
  return Math.max(60, Math.floor((next - nowJst) / 1000));
}

// やのしんTDnet WebAPIの1件は {"Tdnet": {...}} 形式
function rec(item) {
  return (item && (item.Tdnet || item.tdnet)) || item || {};
}

function jsonResponse(body, extraHeaders) {
  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: Object.assign(
      {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      },
      extraHeaders || {}
    ),
  });
}

export async function onRequest(context) {
  const reqUrl = new URL(context.request.url);
  const debugOn = reqUrl.searchParams.get("debug") === "1";
  const dump = reqUrl.searchParams.get("dump") === "1";
  const raw = reqUrl.searchParams.get("raw"); // ?raw=YYYYMMDD で生レスポンス確認

  // 情報源到達性プローブ: 各取得に8秒タイムアウトを付けて並行試行
  if (reqUrl.searchParams.get("probe") === "1") {
    const targets = [
      ["date_limit100", "https://webapi.yanoshin.jp/webapi/tdnet/list/20260604.json?limit=100"],
      ["date_limit300", "https://webapi.yanoshin.jp/webapi/tdnet/list/20260604.json?limit=300"],
      ["date_limit600", "https://webapi.yanoshin.jp/webapi/tdnet/list/20260604.json?limit=600"],
      ["code8960_limit50", "https://webapi.yanoshin.jp/webapi/tdnet/list/8960.json?limit=50"],
    ];
    const out = {};
    await Promise.all(
      targets.map(async ([name, url]) => {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 8000);
        try {
          const r = await fetch(url, {
            signal: ctrl.signal,
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
              Accept: "*/*",
              "Accept-Language": "ja,en;q=0.8",
            },
          });
          const txt = await r.text();
          let totalCount = null;
          let itemCount = null;
          try {
            const j = JSON.parse(txt);
            totalCount = j.total_count != null ? j.total_count : null;
            itemCount = (j.items || []).length;
          } catch (e) {}
          out[name] = {
            status: r.status,
            length: txt.length,
            total_count: totalCount,
            items: itemCount,
          };
        } catch (e) {
          out[name] = { error: String(e).slice(0, 140) };
        } finally {
          clearTimeout(to);
        }
      })
    );
    return jsonResponse({ probe: out });
  }

  // raw: 指定日の生APIレスポンス（先頭）＋件数を返す
  if (raw) {
    const url =
      "https://webapi.yanoshin.jp/webapi/tdnet/list/" + raw + ".json?limit=" + PER_DAY_LIMIT;
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const text = await res.text();
      let total = -1;
      try {
        const j = JSON.parse(text);
        total = ((j && j.items) || []).length;
      } catch (e) {}
      return new Response(
        "status=" + res.status + " total=" + total + "\n\n" + text.slice(0, 4000),
        { headers: { "Content-Type": "text/plain; charset=utf-8" } }
      );
    } catch (e) {
      return new Response("fetch error: " + e, { status: 502 });
    }
  }

  // 直近DAYS日分の日付（JST基準）
  const baseJst = new Date(Date.now() + 9 * 3600000);
  const dates = [];
  for (let i = 0; i < DAYS; i++) {
    dates.push(ymd(new Date(baseJst.getTime() - i * 86400000)));
  }

  const dayStatus = {};

  try {
    const lists = await Promise.all(
      dates.map(async (date) => {
        const url =
          "https://webapi.yanoshin.jp/webapi/tdnet/list/" +
          date +
          ".json?limit=" +
          PER_DAY_LIMIT;
        try {
          const res = await fetch(url, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (compatible; MyPortal/1.0; +https://myworkportal.pages.dev)",
              Accept: "application/json",
            },
          });
          if (!res.ok) {
            dayStatus[date] = "status " + res.status;
            return [];
          }
          const data = await res.json();
          const items = (data && data.items) || [];
          // 投資法人(REIT)の開示だけ抽出（題名は後段でフィルタ）
          const reits = items
            .map(rec)
            .filter((t) => t && t.company_name && t.company_name.indexOf("投資法人") >= 0 && t.title)
            .map((t) => ({
              company: t.company_name,
              title: t.title,
              pubdate: t.pubdate || "",
              ts: Date.parse((t.pubdate || "").replace(" ", "T") + "+09:00"),
              link: t.document_url || t.url || "",
            }));
          dayStatus[date] = { total: items.length, reit: reits.length };
          return reits;
        } catch (e) {
          dayStatus[date] = "err";
          return [];
        }
      })
    );

    let all = [].concat.apply([], lists);
    all.sort((a, b) => (b.ts || 0) - (a.ts || 0));

    // 診断: 投資法人の全開示（題名そのまま）を返す
    if (dump) {
      return jsonResponse({
        count: all.length,
        days: dayStatus,
        items: all.map((it) => ({
          date: it.pubdate ? it.pubdate.slice(0, 10) : "",
          company: it.company,
          title: it.title,
          hit: isPropertyDeal(it.title),
        })),
      });
    }

    // 物件の取得・売却・賃貸借に限定
    let items = all
      .filter((it) => isPropertyDeal(it.title))
      .slice(0, 80)
      .map((it) => ({
        date: it.pubdate ? it.pubdate.slice(5, 10).replace("-", "/") : "",
        title: it.company + "：" + it.title,
        link: it.link,
      }));

    const body = { updatedAt: new Date().toISOString(), days: DAYS, items };
    if (debugOn) {
      body.debug = { dayStatus: dayStatus, totalReit: all.length, hits: items.length };
    }

    return jsonResponse(body, {
      "Cache-Control": "public, max-age=" + secondsUntilNext8amJST(),
    });
  } catch (e) {
    const body = { updatedAt: new Date().toISOString(), items: [], error: String(e) };
    if (debugOn) body.debug = { dayStatus: dayStatus };
    return jsonResponse(body);
  }
}
