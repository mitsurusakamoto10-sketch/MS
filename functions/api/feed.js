// ============================================================
// 公開ページのサムネイル取得 Function（NFM / NewsPicks）
// ------------------------------------------------------------
// ログイン前の公開トップページを取得し、記事リンク + サムネイル画像 +
// タイトルを抽出して返します（会員ページの中身は取得しません）。
//
// 呼び出し: GET /api/feed?src=nfm   または  ?src=newspicks
//   &debug=1 で診断情報も返します。
//
// ※相手サイトがbot拒否(403)やJavaScript描画の場合は取得できません。
//   その場合は debug の status / htmlLength / count をご確認ください。
// ============================================================

const SOURCES = {
  nfm: {
    url: "https://nfm.nikkeibp.co.jp/",
    base: "https://nfm.nikkeibp.co.jp",
    linkRe: /\/atcl\//i,
    limit: 8,
  },
  newspicks: {
    url: "https://newspicks.com/",
    base: "https://newspicks.com",
    linkRe: /\/news\/\d+/i,
    limit: 5,
  },
};

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

// imgタグから画像URLを取り出す（遅延読み込み属性にも対応）
function extractImg(imgTag, base) {
  if (!imgTag) return "";
  let m =
    imgTag.match(/(?:data-src|data-original|data-lazy-src)=["']([^"']+)["']/i) ||
    imgTag.match(/\ssrc=["']([^"']+)["']/i);
  let url = m ? m[1] : "";
  if (!url) {
    const ss = imgTag.match(/srcset=["']([^"', ]+)/i);
    if (ss) url = ss[1];
  }
  if (!url) return "";
  try {
    return new URL(url, base).href;
  } catch (e) {
    return "";
  }
}

function parse(html, conf) {
  const items = [];
  const seen = new Set();
  const anchorRe = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = anchorRe.exec(html)) !== null && items.length < conf.limit * 3) {
    const href = m[1];
    const inner = m[2];
    let url;
    try {
      url = new URL(href, conf.base).href;
    } catch (e) {
      continue;
    }
    if (!conf.linkRe.test(url)) continue;
    if (seen.has(url)) continue;

    const imgTag = inner.match(/<img[^>]+>/i);
    const image = extractImg(imgTag ? imgTag[0] : "", conf.base);
    let title = "";
    if (imgTag) {
      const alt = imgTag[0].match(/alt=["']([^"']+)["']/i);
      if (alt) title = clean(alt[1]);
    }
    if (!title) title = clean(inner);
    if (!title || title.length < 6) continue;

    seen.add(url);
    items.push({ title, link: url, image });
  }
  return items.slice(0, conf.limit);
}

export async function onRequest(context) {
  const reqUrl = new URL(context.request.url);
  const src = reqUrl.searchParams.get("src");
  const debugOn = reqUrl.searchParams.get("debug");
  const conf = SOURCES[src];

  if (!conf) {
    return new Response(JSON.stringify({ items: [], error: "unknown src" }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const debug = { status: null, htmlLength: 0, count: 0 };
  try {
    const res = await fetch(conf.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "ja,en;q=0.8",
        Accept: "text/html",
      },
    });
    debug.status = res.status;
    if (!res.ok) throw new Error("status " + res.status);
    const html = await res.text();
    debug.htmlLength = html.length;

    const items = parse(html, conf);
    debug.count = items.length;

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
