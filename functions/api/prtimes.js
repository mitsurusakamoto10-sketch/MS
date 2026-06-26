// ============================================================
// 競合各社 PR TIMES リリース取得 Function
// ------------------------------------------------------------
// 競合各社のPR TIMES企業別RSS(companyrdf.php?company_id=ID)を
// まとめて取得し、直近N日分のリリースを最新順で返します。
//
// 呼び出し: GET /api/prtimes
//   &fresh=... でキャッシュ回避、&debug=1 で会社別の取得状況を返す。
//
// ※PR TIMESのcompanyrdf.phpはRSS1.0(RDF)。<item>内の
//   <title>/<link>/<dc:date> を抽出します。
// ============================================================

const DAYS = 10; // 直近何日分を表示するか

// 競合各社（PR TIMES company_id は調査で確認済み）
const COMPANIES = [
  { name: "三井不動産", id: 51782 },
  { name: "三菱地所", id: 16002 },
  { name: "住友不動産", id: 46698 },
  { name: "東京建物", id: 52843 },
  { name: "野村不動産", id: 38280 },
  { name: "東急不動産", id: 6953 },
  { name: "森トラスト", id: 18049 },
  { name: "ヒューリック", id: 46371 },
  { name: "森ビル", id: 48109 },
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

// dc:date(ISO) などを JST の YYYY-MM-DD に
function toJstYmd(ts) {
  const j = new Date(ts + 9 * 3600000);
  return j.getUTCFullYear() + "-" + pad2(j.getUTCMonth() + 1) + "-" + pad2(j.getUTCDate());
}

function parseItems(xml) {
  const items = [];
  const re = /<item\b[\s\S]*?<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const b = m[0];
    const title = clean(pick(b, "title"));
    const link = clean(pick(b, "link"));
    const dateRaw = clean(pick(b, "dc:date")) || clean(pick(b, "pubDate"));
    const ts = Date.parse(dateRaw);
    if (!title || !link || isNaN(ts)) continue;
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
      const url = "https://prtimes.jp/companyrdf.php?company_id=" + co.id;
      try {
        const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: "follow" });
        if (!res.ok) {
          debug[co.name] = { status: res.status, items: 0, recent: 0 };
          return [];
        }
        const xml = await res.text();
        const all = parseItems(xml);
        const recent = all.filter((it) => it.ts >= cutoff);
        debug[co.name] = { status: 200, items: all.length, recent: recent.length };
        return recent.map((it) => ({
          company: co.name,
          title: it.title,
          link: it.link,
          date: it.date,
          ts: it.ts,
        }));
      } catch (e) {
        debug[co.name] = { status: "ERR", error: String(e).slice(0, 100) };
        return [];
      }
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
