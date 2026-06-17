// ============================================================
// 公開ページの記事タイトル取得 Function（NFM / NewsPicks）
// ------------------------------------------------------------
// ログイン前の公開トップページを取得し、記事タイトル + 記事URLを
// 抽出して返します（会員ページの中身は取得しません）。
//
// 呼び出し: GET /api/feed?src=nfm   または  ?src=newspicks
//   &debug=1 で診断情報、&raw=1 で対象HTMLの一部を返します（調整用）。
// ============================================================

const SOURCES = {
  nfm: {
    url: "https://nfm.nikkeibp.co.jp/",
    base: "https://nfm.nikkeibp.co.jp",
    linkRe: /\/atcl\//i,
    limit: 6,
    // 「新着記事」セクションだけを対象にする
    sectionStart: "新着記事",
    sectionEnd: "お知らせ",
    preferAlt: true,
    // 先頭に付くカテゴリ表記を除去
    stripCats: [
      "売買・開発",
      "売買",
      "移転",
      "開発",
      "戦略",
      "トラブル",
      "海外",
      "調査／データ",
      "調査",
      "データ",
      "特集",
      "市場レポート",
      "オフィスビル",
    ],
  },
  newspicks: {
    url: "https://newspicks.com/",
    base: "https://newspicks.com",
    linkRe: /\/news\/\d+/i,
    limit: 5,
    preferAlt: false,
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

// CSSやスクリプトの混入を弾く
function looksLikeJunk(s) {
  return /[{}]|display\s*:|css-[a-z0-9]|@media|webkit/i.test(s);
}

function parse(html, conf) {
  // 対象セクションだけに絞り込む（指定があれば）
  let region = html;
  if (conf.sectionStart) {
    const si = html.indexOf(conf.sectionStart);
    if (si >= 0) {
      let ei = conf.sectionEnd ? html.indexOf(conf.sectionEnd, si + conf.sectionStart.length) : -1;
      if (ei < 0) ei = si + 14000;
      region = html.slice(si, ei);
    }
  }

  const items = [];
  const seen = new Set();
  const anchorRe = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = anchorRe.exec(region)) !== null) {
    const href = m[1];
    let url;
    try {
      url = new URL(href, conf.base).href;
    } catch (e) {
      continue;
    }
    if (!conf.linkRe.test(url)) continue;
    if (seen.has(url)) continue;

    let title = "";
    // 画像のalt属性にタイトルが入っていることが多い
    if (conf.preferAlt) {
      const img = m[2].match(/<img[^>]+alt=["']([^"']+)["']/i);
      if (img) title = clean(img[1]);
    }
    if (!title) title = clean(m[2]);
    if (!title || looksLikeJunk(title)) continue;

    // 先頭のカテゴリ表記を除去
    if (conf.stripCats) {
      for (const c of conf.stripCats) {
        if (title.startsWith(c)) {
          title = title.slice(c.length).trim();
          break;
        }
      }
    }
    if (title.length < 6) continue;

    seen.add(url);
    items.push({ title, link: url });
    if (items.length >= conf.limit) break;
  }
  return items;
}

export async function onRequest(context) {
  const reqUrl = new URL(context.request.url);
  const src = reqUrl.searchParams.get("src");
  const debugOn = reqUrl.searchParams.get("debug");
  const rawOn = reqUrl.searchParams.get("raw");
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

    // 調整用：対象セクション周辺のHTMLを返す
    if (rawOn) {
      let snippet = html;
      if (conf.sectionStart) {
        const si = html.indexOf(conf.sectionStart);
        if (si >= 0) snippet = html.slice(si, si + 4000);
      } else {
        snippet = html.slice(0, 4000);
      }
      return new Response(snippet, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

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
