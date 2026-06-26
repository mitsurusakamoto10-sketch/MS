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

// PR TIMES企業別RSS
function prt(id) {
  return "https://prtimes.jp/companyrdf.php?company_id=" + id;
}
// 自社サイトHTMLスクレイピング指定
function html(url) {
  return { html: url };
}
// Google News RSS（社名検索・公式以外の報道も含む補完用）
function gnews(query) {
  return (
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent('"' + query + '"') +
    "&hl=ja&gl=JP&ceid=JP:ja"
  );
}
// Bing News RSS（社名検索・補完用。Google Newsが不可な環境向け）
function bingnews(query) {
  return (
    "https://www.bing.com/news/search?q=" +
    encodeURIComponent('"' + query + '"') +
    "&format=rss&setlang=ja-JP&cc=JP"
  );
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
  { name: "野村不動産", feeds: [prt(38280), bingnews("野村不動産"), gnews("野村不動産")] }, // 自社403・PR TIMES空 → ニュース検索で補完
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
  {
    name: "ヒューリック",
    feeds: [
      html("https://www.hulic.co.jp/news/"), // 自社HTML優先（公式の最新）
      prt(46371),
      gnews("ヒューリック"),                  // 取れない場合はGoogle News補完
    ],
  },
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

// 自社サイトHTMLから記事を抽出（/news/配下のリンク＋近傍に日付があるもの）
function scrapeHtml(baseUrl, htmlText) {
  const items = [];
  const seen = new Set();
  const anchorRe = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = anchorRe.exec(htmlText)) !== null) {
    let url;
    try {
      url = new URL(m[1], baseUrl).href.split("?")[0];
    } catch (e) {
      continue;
    }
    if (url.indexOf("/news/") < 0) continue;
    if (/\/news\/?$/.test(url)) continue; // 一覧トップ自身は除外
    if (seen.has(url)) continue;

    let title = clean(m[2]);
    const img = m[2].match(/<img[^>]+alt=["']([^"']+)["']/i);
    if ((!title || title.length < 8) && img) title = clean(img[1]);
    if (!title || title.length < 8 || /[{}]|css-/.test(title)) continue;

    // 近傍に日付があるものだけ採用（ナビ等の除外）
    const ctx = htmlText.slice(Math.max(0, m.index - 250), m.index + m[0].length + 250);
    const dm =
      ctx.match(/datetime=["'](20\d{2})-(\d{1,2})-(\d{1,2})/i) ||
      ctx.match(/(20\d{2})[.\/\-](\d{1,2})[.\/\-](\d{1,2})/) ||
      ctx.match(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/);
    if (!dm) continue;
    const ts = Date.parse(
      dm[1] + "-" + pad2(+dm[2]) + "-" + pad2(+dm[3]) + "T00:00:00+09:00"
    );
    if (isNaN(ts)) continue;

    seen.add(url);
    items.push({ title, link: url, ts, date: toJstYmd(ts) });
    if (items.length >= 20) break;
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
  const rawTarget = reqUrl.searchParams.get("raw"); // ?raw=会社名 でHTML確認
  const cutoff = Date.now() - DAYS * 86400000;
  const debug = {};

  // raw指定時：その会社のHTML候補の記事リンク周辺HTMLを返す
  if (rawTarget) {
    const co = COMPANIES.find((c) => c.name === rawTarget);
    const h = co && co.feeds.find((f) => typeof f === "object" && f.html);
    if (h) {
      try {
        const res = await fetch(h.html, { headers: BROWSER_HEADERS, redirect: "follow" });
        const t = await res.text();
        const mm = t.match(/href=["'][^"']*\/news\/[^"']+["']/i);
        const idx = mm ? t.indexOf(mm[0]) : 0;
        return new Response(t.slice(Math.max(0, idx - 1500), idx + 2500), {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      } catch (e) {
        return new Response("fetch error: " + e, { status: 502 });
      }
    }
    return new Response("no html source for " + rawTarget, { status: 404 });
  }

  const lists = await Promise.all(
    COMPANIES.map(async (co) => {
      // 候補を順に試し、最初に取れたものを採用（文字列=RSS / {html}=スクレイピング）
      for (const f of co.feeds) {
        const isHtml = typeof f === "object" && f.html;
        const url = isHtml ? f.html : f;
        try {
          // Google Newsは同意画面リダイレクト回避のためCONSENT Cookieを付与
          const headers = Object.assign({}, BROWSER_HEADERS);
          if (url.indexOf("news.google.com") >= 0) {
            headers["Cookie"] = "CONSENT=YES+cb.20211129-04-p0.en+F+060";
          }
          const res = await fetch(url, { headers, redirect: "follow" });
          if (!res.ok) continue;
          const text = await res.text();
          const all = isHtml ? scrapeHtml(url, text) : parseFeed(text);
          if (all.length === 0) continue;
          const recent = all.filter((it) => it.ts >= cutoff);
          debug[co.name] = {
            source: url,
            type: isHtml ? "html" : "feed",
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
