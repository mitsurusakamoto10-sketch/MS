// ============================================================
// 総合ディベロッパーの「公式サイト」プレスリリース取得 Function
// ------------------------------------------------------------
// 各社の公式サイトのニュース/リリース一覧ページをサーバー側で取得し、
// 日付付きのリンクを抽出して、全社まとめて「最新10件」を返します。
// （報道記事は含めず、公式HPのリリースのみに限定）
//
// 呼び出し: GET /api/news
//
// ※各社サイトのHTML構造に依存するため、構造変更時は調整が必要です。
// ============================================================

// 各社の公式ニュース一覧ページ（先頭から順に試し、取れたものを採用）
const SITES = [
  {
    company: "三井不動産",
    urls: ["https://www.mitsuifudosan.co.jp/corporate/news/"],
  },
  {
    company: "三菱地所",
    urls: ["https://www.mec.co.jp/news/", "https://www.mec.co.jp/company/press/"],
  },
  {
    company: "住友不動産",
    urls: ["https://www.sumitomo-rd.co.jp/news/"],
  },
  {
    company: "東急不動産",
    urls: ["https://www.tokyu-land.co.jp/news/", "https://www.tokyu-land.co.jp/news.html"],
  },
  {
    company: "野村不動産",
    urls: ["https://www.nomura-re.co.jp/news/", "https://www.nomura-re.co.jp/release/"],
  },
];

// タグ・実体参照を除去
function clean(s) {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 公式ニュースページのHTMLから「日付付きのニュースリンク」を抽出
function parseOfficial(html, baseUrl, company) {
  const items = [];
  const seen = new Set();
  const dateRe = /(20\d{2})[.\/年\-](\d{1,2})[.\/月\-](\d{1,2})/;
  const anchorRe = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = anchorRe.exec(html)) !== null) {
    const href = m[1];
    const title = clean(m[2]);
    if (!title || title.length < 8) continue; // 短すぎる＝メニュー等を除外

    let url;
    try {
      url = new URL(href, baseUrl).href;
    } catch (e) {
      continue;
    }
    // ニュース/リリース系のURLのみ対象
    if (!/news|release|press|topics|information/i.test(url)) continue;
    if (seen.has(url)) continue;

    // アンカーの周辺に日付があるか（一覧では日付とリンクが近接している前提）
    const ctxStart = Math.max(0, m.index - 280);
    const ctx = html.slice(ctxStart, m.index + m[0].length + 40);
    const d = ctx.match(dateRe);
    if (!d) continue;

    const y = +d[1];
    const mo = +d[2];
    const day = +d[3];
    const ts = Date.UTC(y, mo - 1, day);
    if (isNaN(ts)) continue;

    seen.add(url);
    items.push({ company, title, link: url, ts, date: mo + "/" + day });
  }
  return items;
}

// 1社分を取得（候補URLを順に試す）
async function fetchSite(site) {
  for (const url of site.urls) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; MyworkportalBot/1.0; +https://myworkportal.pages.dev)",
          "Accept-Language": "ja",
        },
      });
      if (!res.ok) continue;
      const html = await res.text();
      const items = parseOfficial(html, url, site.company);
      if (items.length) return items;
    } catch (e) {
      // 次の候補URLへ
    }
  }
  return [];
}

export async function onRequest() {
  try {
    const lists = await Promise.all(SITES.map(fetchSite));
    const all = [].concat.apply([], lists);

    const items = all
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 10)
      .map((it) => {
        let host = "";
        try {
          host = new URL(it.link).hostname;
        } catch (e) {
          host = "";
        }
        return {
          company: it.company,
          title: it.title,
          link: it.link,
          date: it.date,
          source: it.company + " 公式",
          thumb: host
            ? "https://www.google.com/s2/favicons?domain=" + host + "&sz=64"
            : "",
        };
      });

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
