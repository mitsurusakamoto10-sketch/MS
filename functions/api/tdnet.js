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
const PER_DAY_LIMIT = 500; // 1日の適時開示はピーク日でも数百件。1000はタイムアウト(504)するため500。

// 物件取引と判定するには「動作」と「不動産系の対象」の両方を題名に含むこと。
// （自己株式/自己投資口/新株予約権の「取得」等のノイズを除外するため）
const ACTION_KEYWORDS = ["取得", "売却", "譲渡", "処分", "賃貸借", "賃貸", "貸借", "リース"];
const ESTATE_KEYWORDS = ["不動産", "物件", "信託受益権", "底地", "資産"];

function isPropertyDeal(desc) {
  if (!desc) return false;
  const hasAction = ACTION_KEYWORDS.some((kw) => desc.indexOf(kw) >= 0);
  const hasEstate = ESTATE_KEYWORDS.some((kw) => desc.indexOf(kw) >= 0);
  return hasAction && hasEstate;
}

// 上場REIT(投資法人)の開示か判定
// やのしんAPIの社名は略称が多く「投資法人」を含まないことがあり、
// REIT銘柄は社名先頭に「Ｒ−」が付く傾向があるため複数条件で判定。
function isReit(name) {
  if (!name) return false;
  if (name.indexOf("投資法人") >= 0) return true;
  if (/REIT/i.test(name)) return true; // カタカナ「リート」は誤検出(アクリート等)があるため除外
  // やのしんはREIT銘柄名を「Ｒ－○○」(全角Ｒ)で始める。
  // 半角Rは非REIT企業(REVOLUTION等)があるため全角Ｒのみ採用。
  if (name.charCodeAt(0) === 0xff32) return true; // 全角Ｒ始まり
  return false;
}

// 表示用に先頭の「Ｒ－」「R-」等のREIT接頭辞を除去
function cleanCompany(name) {
  return String(name || "").replace(/^[ＲR][－\-−]\s*/, "");
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

  // 直近DAYS日分の日付（JST基準）
  const baseJst = new Date(Date.now() + 9 * 3600000);
  const dates = [];
  for (let i = 0; i < DAYS; i++) {
    dates.push(ymd(new Date(baseJst.getTime() - i * 86400000)));
  }

  const dayStatus = {};

  // 1日分を取得（8秒タイムアウト＋1回リトライ）。投資法人の開示だけ返す。
  async function fetchDay(date) {
    const url =
      "https://webapi.yanoshin.jp/webapi/tdnet/list/" + date + ".json?limit=" + PER_DAY_LIMIT;
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 8000);
      try {
        const res = await fetch(url, {
          signal: ctrl.signal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; MyPortal/1.0; +https://myworkportal.pages.dev)",
            Accept: "application/json",
          },
        });
        clearTimeout(to);
        if (!res.ok) {
          if (attempt === 0) continue;
          dayStatus[date] = "status " + res.status;
          return [];
        }
        const data = await res.json();
        const items = (data && data.items) || [];
        // 全開示を取り込み（REIT判定・物件判定は後段）。社名・コードも保持。
        const list = items
          .map(rec)
          .filter((t) => t && t.title)
          .map((t) => ({
            company: t.company_name || "",
            code: t.company_code || "",
            title: t.title,
            pubdate: t.pubdate || "",
            ts: Date.parse((t.pubdate || "").replace(" ", "T") + "+09:00"),
            link: t.document_url || t.url || "",
          }));
        dayStatus[date] = {
          total: items.length,
          reitProp: list.filter((x) => isReit(x.company) && isPropertyDeal(x.title)).length,
        };
        return list;
      } catch (e) {
        clearTimeout(to);
        if (attempt === 0) continue;
        dayStatus[date] = "err";
        return [];
      }
    }
    return [];
  }

  try {
    // やのしんへの負荷を抑えるため、6並列ずつのバッチで取得
    const lists = [];
    const CONC = 6;
    for (let i = 0; i < dates.length; i += CONC) {
      const part = await Promise.all(dates.slice(i, i + CONC).map(fetchDay));
      lists.push.apply(lists, part);
    }

    let all = [].concat.apply([], lists);
    all.sort((a, b) => (b.ts || 0) - (a.ts || 0));

    // 診断: 全社の「物件取引お知らせ」を社名・コード付きで返す（REIT判定の確認用）
    if (dump) {
      return jsonResponse({
        totalAll: all.length,
        days: dayStatus,
        property: all
          .filter((it) => isPropertyDeal(it.title))
          .map((it) => ({
            date: it.pubdate ? it.pubdate.slice(0, 10) : "",
            company: it.company,
            code: it.code,
            reit: isReit(it.company),
            title: it.title,
          })),
      }, { "Cache-Control": "no-store" });
    }

    // 上場REIT(投資法人) かつ 物件の取得・売却・賃貸借に限定
    let items = all
      .filter((it) => isReit(it.company) && isPropertyDeal(it.title))
      .slice(0, 80)
      .map((it) => ({
        date: it.pubdate ? it.pubdate.slice(5, 10).replace("-", "/") : "",
        title: cleanCompany(it.company) + "：" + it.title,
        link: it.link,
      }));

    const body = { updatedAt: new Date().toISOString(), days: DAYS, items };
    if (debugOn) {
      body.debug = { dayStatus: dayStatus, totalAll: all.length, hits: items.length };
    }

    const cache = caches.default;
    const cacheKey = new Request("https://tdnet.local/reit-property-lastgood-v1");

    if (items.length > 0) {
      // 成功：結果を「last-good」として保存（やのしん不調時のフォールバック用・7日）
      if (!debugOn && context.waitUntil) {
        context.waitUntil(
          cache.put(cacheKey, jsonResponse(body, { "Cache-Control": "max-age=604800" }))
        );
      }
      return jsonResponse(body, {
        "Cache-Control": debugOn ? "no-store" : "public, max-age=" + secondsUntilNext8amJST(),
      });
    }

    // 取得失敗/0件：直近の成功結果(last-good)があればそれを返す（空表示を避ける）
    if (!debugOn) {
      const cached = await cache.match(cacheKey);
      if (cached) {
        const prev = await cached.json();
        prev.stale = true; // 直近の成功結果を表示している印
        return jsonResponse(prev, { "Cache-Control": "public, max-age=600" });
      }
    }
    return jsonResponse(body, { "Cache-Control": "no-store" });
  } catch (e) {
    // 例外時もlast-goodがあれば返す
    try {
      const cached = await caches.default.match(
        new Request("https://tdnet.local/reit-property-lastgood-v1")
      );
      if (cached && !debugOn) {
        const prev = await cached.json();
        prev.stale = true;
        return jsonResponse(prev, { "Cache-Control": "public, max-age=600" });
      }
    } catch (e2) {}
    const body = { updatedAt: new Date().toISOString(), items: [], error: String(e) };
    if (debugOn) body.debug = { dayStatus: dayStatus };
    return jsonResponse(body, { "Cache-Control": "no-store" });
  }
}
