// ============================================================
// 総合ディベロッパーのプレスリリース取得 Function
// ------------------------------------------------------------
// 各社公式サイトは自動アクセスを拒否(403)するため直接取得できません。
// そこで取得可能な GoogleニュースRSS を使い、配信元が
// 「各社公式ドメイン」または「PR TIMES(公式リリース配信)」のものに
// 絞り込んで、公式リリースを最新10件返します。
//
// 呼び出し: GET /api/news
//   ?debug=1 を付けると診断情報も返します。
// ============================================================

const DEVELOPERS = [
  "三井不動産",
  "三菱地所",
  "住友不動産",
  "東急不動産",
  "野村不動産",
];

// 「公式リリース」とみなす配信元ドメイン（各社公式 + PR TIMES）
const OFFICIAL_HOSTS = [
  "mitsuifudosan.co.jp",
  "mec.co.jp",
  "sumitomo-rd.co.jp",
  "tokyu-land.co.jp",
  "tokyu-fudosan-hd.co.jp",
  "nomura-re.co.jp",
  "nomura-re-hd.co.jp",
  "prtimes.jp",
];

function pick(block, tag) {
  const m = block.match(new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)<\\/" + tag + ">"));
  return m ? m[1] : "";
}
function clean(s) {
  return s
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .trim();
}
function parseItems(xml) {
  const items = [];
  const blocks = xml.split("<item>").slice(1);
  for (const raw of blocks) {
    const block = raw.split("</item>")[0];
    const title = clean(pick(block, "title"));
    const link = clean(pick(block, "link"));
    const pubDate = clean(pick(block, "pubDate"));
    const srcMatch = block.match(/<source[^>]*url="([^"]*)"[^>]*>([\s\S]*?)<\/source>/);
    const sourceUrl = srcMatch ? srcMatch[1] : "";
    const sourceName = srcMatch ? clean(srcMatch[2]) : "";
    if (title && link) items.push({ title, link, pubDate, sourceUrl, sourceName });
  }
  return items;
}

export async function onRequest(context) {
  const debugOn =
    context && context.request && new URL(context.request.url).searchParams.get("debug");

  const query = DEVELOPERS.join(" OR ") + " when:14d";
  const feedUrl =
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(query) +
    "&hl=ja&gl=JP&ceid=JP:ja";

  const debug = { feedStatus: null, totalFetched: 0, officialCount: 0, hosts: {} };

  try {
    const res = await fetch(feedUrl, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/rss+xml" },
    });
    debug.feedStatus = res.status;
    if (!res.ok) throw new Error("feed status " + res.status);
    const xml = await res.text();

    const parsed = parseItems(xml);
    debug.totalFetched = parsed.length;

    const enriched = parsed.map((it) => {
      let host = "";
      try {
        host = it.sourceUrl ? new URL(it.sourceUrl).hostname.replace(/^www\./, "") : "";
      } catch (e) {
        host = "";
      }
      debug.hosts[host || "(unknown)"] = (debug.hosts[host || "(unknown)"] || 0) + 1;

      let title = it.title;
      if (it.sourceName && title.endsWith(" - " + it.sourceName)) {
        title = title.slice(0, -(" - " + it.sourceName).length);
      }
      const company = DEVELOPERS.find((d) => title.includes(d)) || "ディベロッパー";
      const ts = it.pubDate ? Date.parse(it.pubDate) : NaN;
      const d = isNaN(ts) ? null : new Date(ts);
      const date = d ? d.getMonth() + 1 + "/" + d.getDate() : "";
      return { title, link: it.link, company, host, date, ts };
    });

    // 公式ドメイン / PR TIMES の配信のみに限定
    const official = enriched.filter((it) =>
      OFFICIAL_HOSTS.some((h) => it.host === h || it.host.endsWith("." + h))
    );
    debug.officialCount = official.length;

    const items = official
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))
      .slice(0, 10)
      .map((it) => ({
        company: it.company,
        title: it.title,
        link: it.link,
        date: it.date,
        host: it.host,
        thumb: it.host
          ? "https://www.google.com/s2/favicons?domain=" + it.host + "&sz=64"
          : "",
      }));

    const body = { updatedAt: new Date().toISOString(), items };
    if (debugOn) body.debug = debug;

    return new Response(JSON.stringify(body), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=900",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    const body = { updatedAt: new Date().toISOString(), items: [], error: String(e) };
    if (debugOn) body.debug = debug;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}
