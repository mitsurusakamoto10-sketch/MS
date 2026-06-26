// ============================================================
// 競合各社リリース 統合取得 Function（自社RSS優先 + PR TIMES補完）
// ------------------------------------------------------------
// 各社ごとに「取得できる最良ソース」からリリースを取得し、
// 直近N日分を最新順で返します。
//   - 自社サイトRSSが本番から取れる社（住友/東京建物/東急）は自社RSS
//     ＝“真の最新”（自社サイトにしか出ないリリースも拾える）
//   - 自社が403で取れない社（三井/三菱 等）は PR TIMES企業別RSSで補完
// 各社は候補URLを順に試し、最初にパースできたフィードを採用します。
//
// 呼び出し: GET /api/competitors
//   &fresh=... でキャッシュ回避、&debug=1 で会社別の採用ソース/件数を返す。
// ============================================================

const DAYS = 10;

// PR TIMES企業別RSL
function prt(id) {
  return "https://prtimes.jp/companyrdf.php?company_id=" + id;
}

// 各社の候補フィード（上から順に試し、最初に取れたものを採用）
// 自社RSSを先頭に置く社は、そちらが“真の最新”になる。
const COMPANIES = [
  { name: "三井不動産", feeds: [prt(51782)] },                 // 自社403 → PR TIMES
  { name: "三菱地所", feeds: [prt(16002)] },                   // 自社403 → PR TIMES
  {
    name: "住友不動産",
    feeds: [
      "https://www.sumitomo-rd.co.jp/news/feed/",            // 自社RSS（最新・6月分含む）
      "https://www.sumitomo-rd.co.jp/feed/",
      prt(46698),
    ],
  },
  {
    name: "東京建物",
    feeds: ["https://tatemono.com/news/rss/news.php", prt(52843)], // 自社RSS優先
  },
  { name: "野村不動産", feeds: [prt(38280)] },                 // 自社403・PR TIMESも要確認
  {
    name: "東急不動産",
    feeds: [
      "https://www.tokyu-fudosan-hd.co.jp/news/others/rss",  // 自社RSS優先
      "https://xml.irpocket.com/3289/XML/release-all-latest-12m.rdf",
      "https://www.tokyu-fudosan-hd.co.jp/news/companies/rss",
      prt(6953),
    ],
  },
  { name: "森トラスト", feeds: [prt(18049)] },                 // 自社はHTMLのみ → PR TIMES
  { name: "ヒューリック", feeds: [prt(46371)] },               // 自社はHTMLのみ → PR TIMES
  { name: "森ビル", feeds: [prt(48109)] },                     // 自社はHTMLのみ → PR TIMES
];

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "ja,en;q=0.9",
  Accept: "application/rss+xml, application/xml, text/xml, */*;q=0.8",
};

function pad2(n) {
  return n < 10 ? "0" + n : "" + n;
}

function secondsUntilNext8amJST() {
  const nowJst = new Date(Date.now() + 9 * 3600000);
  const next = new Date(nowJst);
  next.setUTCHours(8, 0, 0, 0);
  if (next <= nowJst) next.setUTCDate(next.getUTCDate() + 1);
  return Math.max(60, Math.floor((next - nowJst) / 1000));
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#8217;/g, "’")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&nbsp;/g, " ");
}

function clean(s) {
  return decodeEntities(
    String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function pick(block, tag) {
  const re = new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)</" + tag + ">", "i");
  const m = block.match(re);
  return m ? m[1] : "";
}

function toJstYmd(ts) {
  const j = new Date(ts + 9 * 3600000);
  return j.getUTCFullYear() + "-" + pad2(j.getUTCMonth() + 1) + "-" + pad2(j.getUTCDate());
}

// RSS2.0 / RSS1.0(RDF) / Atom を横断してパース
function parseFeed(xml) {
  const items = [];
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  for (const b of blocks) {
    const title = clean(pick(b, "title"));
    let link = clean(pick(b, "link"));
    if (!/^https?:\/\//i.test(link)) {
      const lm = b.match(/<link[^>]+href=["']([^"']+)["']/i); // Atom形式
      if (lm) link = lm[1];
    }
    const dateRaw =
      clean(pick(b, "pubDate")) ||
      clean(pick(b, "dc:date")) ||
      clean(pick(b, "updated")) ||
      clean(pick(b, "published"));
    const ts = Date.parse(dateRaw);
    if (!title || !/^https?:\/\//i.test(link) || isNaN(ts)) continue;
    items.push({ title, link, ts, date: toJstYmd(ts) });
  }
  return items;
}

function jsonResponse(body, extraHeaders) {
  return new Response(JSON.stringify(body), {
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
  const debugOn = reqUrl.searchParams.get("debug");
  const cutoff = Date.now() - DAYS * 86400000;
  const debug = {};

  const lists = await Promise.all(
    COMPANIES.map(async (co) => {
      // 候補フィードを順に試し、最初にパースできたものを採用
      for (const url of co.feeds) {
        try {
          const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: "follow" });
          if (!res.ok) continue;
          const xml = await res.text();
          const all = parseFeed(xml);
          if (all.length === 0) continue;
          const recent = all.filter((it) => it.ts >= cutoff);
          debug[co.name] = {
            source: url,
            status: 200,
            items: all.length,
            recent: recent.length,
          };
          return recent.map((it) => ({
            company: co.name,
            title: it.title,
            link: it.link,
            date: it.date,
            ts: it.ts,
          }));
        } catch (e) {
          // 次の候補へ
        }
      }
      debug[co.name] = { source: null, status: "none", items: 0, recent: 0 };
      return [];
    })
  );

  let items = [].concat.apply([], lists);
  items.sort((a, b) => b.ts - a.ts);
  items = items.map((it) => ({
    company: it.company,
    title: it.title,
    link: it.link,
    date: it.date,
  }));

  const body = { updatedAt: new Date().toISOString(), days: DAYS, items };
  if (debugOn) body.debug = debug;

  return jsonResponse(body, {
    "Cache-Control": "public, max-age=" + secondsUntilNext8amJST(),
  });
}
