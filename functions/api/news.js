// ============================================================
// 総合ディベロッパーのプレスリリース/ニュース取得 Function
// ------------------------------------------------------------
// Googleニュースの検索RSS（無料・キー不要）をサーバー側で取得し、
// 直近1週間の記事をJSONにして返します。
// 各社の公式IRページを直接スクレイピングするより壊れにくい方式です。
// （公式リリースだけでなく報道記事も含みます）
//
// 呼び出し: GET /api/news
// ============================================================

// 対象の主要総合ディベロッパー
const DEVELOPERS = [
  "三井不動産",
  "三菱地所",
  "住友不動産",
  "東急不動産",
  "野村不動産",
];

// RSSの1タグを取り出す
function pick(block, tag) {
  const m = block.match(new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)<\\/" + tag + ">"));
  return m ? m[1] : "";
}

// CDATA・実体参照を除去
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

// RSS XML から item を抽出
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

export async function onRequest() {
  const query = DEVELOPERS.join(" OR ") + " when:7d";
  const url =
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(query) +
    "&hl=ja&gl=JP&ceid=JP:ja";

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/rss+xml" },
    });
    if (!res.ok) throw new Error("status " + res.status);
    const xml = await res.text();

    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

    const items = parseItems(xml)
      .map((it) => {
        // 媒体タイトルの末尾「 - 媒体名」を除去
        let title = it.title;
        if (it.sourceName && title.endsWith(" - " + it.sourceName)) {
          title = title.slice(0, -(" - " + it.sourceName).length);
        }
        // タイトルから対象企業名を判定
        const company = DEVELOPERS.find((d) => title.includes(d)) || "ディベロッパー";
        // 媒体アイコンをサムネイルに利用
        let host = "";
        try {
          host = it.sourceUrl ? new URL(it.sourceUrl).hostname : "";
        } catch (e) {
          host = "";
        }
        const thumb = host
          ? "https://www.google.com/s2/favicons?domain=" + host + "&sz=64"
          : "";
        const ts = it.pubDate ? Date.parse(it.pubDate) : NaN;
        const d = isNaN(ts) ? null : new Date(ts);
        const date = d ? d.getMonth() + 1 + "/" + d.getDate() : "";
        return { title, link: it.link, company, source: it.sourceName, thumb, date, ts };
      })
      // 念のため直近7日に絞り、新しい順に並べる
      .filter((it) => isNaN(it.ts) || it.ts >= weekAgo)
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))
      .slice(0, 12);

    return new Response(
      JSON.stringify({ updatedAt: new Date().toISOString(), items }),
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=900",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ updatedAt: new Date().toISOString(), items: [], error: true }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}
