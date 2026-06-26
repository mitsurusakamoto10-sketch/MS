// ============================================================
// 競合各社 リリース取得 診断 Function（read-only）
// ------------------------------------------------------------
// 競合9社のRSS候補URL・ニュース一覧ページを本番(エッジ)から実際に
// 取得し、HTTPステータス・Content-Type・本文長・RSS/HTMLの簡易判定を
// 一覧で返します。これにより「どの社が本番から取得可能か」を確定します。
//
// 呼び出し: GET /api/relcheck
//
// ※UIには一切影響しない診断専用。取得した本文は保存せず、要約のみ返す。
// ============================================================

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "ja,en;q=0.9",
  Accept:
    "text/html,application/xhtml+xml,application/xml,application/rss+xml;q=0.9,*/*;q=0.8",
};

// 会社ごとの「試すURL」。type: rss=フィード期待 / html=一覧ページ
const TARGETS = [
  { company: "三井不動産", type: "html", url: "https://www.mitsuifudosan.co.jp/rss/index.html" },
  { company: "三井不動産", type: "html", url: "https://www.mitsuifudosan.co.jp/corporate/news/" },

  { company: "三菱地所", type: "rss", url: "https://www.mec.co.jp/news/feed/" },
  { company: "三菱地所", type: "rss", url: "https://www.mec.co.jp/news/rss.xml" },
  { company: "三菱地所", type: "html", url: "https://www.mec.co.jp/news/" },

  { company: "住友不動産", type: "rss", url: "https://www.sumitomo-rd.co.jp/news/feed/" },
  { company: "住友不動産", type: "rss", url: "https://www.sumitomo-rd.co.jp/feed/" },
  { company: "住友不動産", type: "html", url: "https://www.sumitomo-rd.co.jp/news/" },

  { company: "東京建物", type: "rss", url: "https://tatemono.com/news/rss/news.php" },
  { company: "東京建物", type: "html", url: "https://tatemono.com/news/" },

  { company: "野村不動産HD", type: "rss", url: "https://www.nomura-re-hd.co.jp/news/feed/" },
  { company: "野村不動産HD", type: "html", url: "https://www.nomura-re-hd.co.jp/news/" },

  { company: "東急不動産HD", type: "rss", url: "https://www.tokyu-fudosan-hd.co.jp/news/others/rss" },
  { company: "東急不動産HD", type: "rss", url: "https://www.tokyu-fudosan-hd.co.jp/news/companies/rss" },
  { company: "東急不動産HD", type: "rss", url: "https://xml.irpocket.com/3289/XML/release-all-latest-12m.rdf" },
  { company: "東急不動産HD", type: "html", url: "https://www.tokyu-land.co.jp/news/" },

  { company: "森トラスト", type: "rss", url: "https://www.mori-trust.co.jp/news/feed/" },
  { company: "森トラスト", type: "html", url: "https://www.mori-trust.co.jp/news/" },

  { company: "ヒューリック", type: "rss", url: "https://www.hulic.co.jp/news/feed/" },
  { company: "ヒューリック", type: "html", url: "https://www.hulic.co.jp/news/" },

  { company: "森ビル", type: "rss", url: "https://www.mori.co.jp/company/press/release/feed/" },
  { company: "森ビル", type: "html", url: "https://www.mori.co.jp/company/press/release/" },
];

// 本文の簡易判定
function analyze(type, body) {
  const head = body.slice(0, 400).toLowerCase();
  const isXml =
    head.indexOf("<?xml") >= 0 ||
    head.indexOf("<rss") >= 0 ||
    head.indexOf("<feed") >= 0 ||
    head.indexOf("<rdf") >= 0;
  const out = { length: body.length, looksXml: isXml };

  if (isXml) {
    const items =
      (body.match(/<item[\s>]/gi) || []).length ||
      (body.match(/<entry[\s>]/gi) || []).length;
    out.itemCount = items;
    // 最初の title / 日付サンプル
    const t = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    out.sampleTitle = t ? t[1].replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, "").trim().slice(0, 60) : "";
    const d = body.match(/<(pubDate|updated|dc:date)[^>]*>([\s\S]*?)<\/(pubDate|updated|dc:date)>/i);
    out.sampleDate = d ? d[2].trim().slice(0, 40) : "";
  } else {
    // HTML: 記事リンク数・日付パターン数のヒント
    out.anchorCount = (body.match(/<a\b/gi) || []).length;
    out.dateHits =
      (body.match(/20\d{2}[.\/\-]\d{1,2}[.\/\-]\d{1,2}/g) || []).length +
      (body.match(/20\d{2}年\s*\d{1,2}月\s*\d{1,2}日/g) || []).length;
    out.hasTimeTag = /<time[\s>]/i.test(body);
  }
  return out;
}

export async function onRequest() {
  const results = await Promise.all(
    TARGETS.map(async (t) => {
      const row = { company: t.company, type: t.type, url: t.url };
      try {
        const res = await fetch(t.url, { headers: BROWSER_HEADERS, redirect: "follow" });
        row.status = res.status;
        row.contentType = res.headers.get("content-type") || "";
        if (res.ok) {
          const body = await res.text();
          Object.assign(row, analyze(t.type, body));
        }
      } catch (e) {
        row.status = "ERR";
        row.error = String(e).slice(0, 120);
      }
      return row;
    })
  );

  // 会社ごとに「取得できたか（OK判定）」を集計
  const verdict = {};
  for (const r of results) {
    const ok =
      r.status === 200 &&
      ((r.type === "rss" && r.looksXml && (r.itemCount || 0) > 0) ||
        (r.type === "html" && (r.dateHits || 0) > 0));
    if (!verdict[r.company]) verdict[r.company] = { rssOK: false, htmlOK: false };
    if (ok && r.type === "rss") verdict[r.company].rssOK = true;
    if (ok && r.type === "html") verdict[r.company].htmlOK = true;
  }

  return new Response(
    JSON.stringify({ checkedAt: new Date().toISOString(), verdict, results }, null, 2),
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}
