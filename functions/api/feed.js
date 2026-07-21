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
    url: "https://nfm.nikkeibp.co.jp/?bn=bn_news&M=30",
    base: "https://nfm.nikkeibp.co.jp",
    linkRe: /\/atcl\//i,
    limit: 12,
    preferAlt: true,
    todayOnly: true, // 当日更新分のみ
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
    // フッター等の規約系リンク（/news/数字 形式だが記事ではない）を除外
    titleBlacklist: [
      "コミュニティ・スタンダード",
      "利用規約",
      "プライバシー",
      "個人情報",
      "運営会社",
      "ヘルプ",
      "広告掲載",
      "特定商取引",
    ],
    // 記事がJS描画で拾えない場合のフォールバック（Bing Newsでnewspicks.com内を検索）
    fallbackRss:
      "https://www.bing.com/news/search?q=site%3Anewspicks.com&format=rss&setlang=ja-JP&cc=JP",
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

// フォールバック用の簡易RSSパーサ（<item>の<title>/<link>を抽出）
function parseRss(xml, limit) {
  const items = [];
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  for (const b of blocks) {
    const tm = b.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const lm = b.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
    if (!tm || !lm) continue;
    const title = clean(tm[1].replace(/<!\[CDATA\[|\]\]>/g, ""));
    const link = clean(lm[1].replace(/<!\[CDATA\[|\]\]>/g, ""));
    if (!title || title.length < 6 || !/^https?:\/\//i.test(link)) continue;
    items.push({ title, link });
    if (items.length >= limit) break;
  }
  return items;
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

  // 当日（JST）の年月日
  const jst = new Date(Date.now() + 9 * 3600000);
  const ty = jst.getUTCFullYear();
  const tm = jst.getUTCMonth() + 1;
  const td = jst.getUTCDate();

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

    // 当日のみ：リンク周辺に「本日の日付」があるかを確認
    if (conf.todayOnly) {
      const ctx = region.slice(Math.max(0, m.index - 220), m.index + m[0].length + 80);
      const dm = ctx.match(/(20\d{2})[.\/\-](\d{1,2})[.\/\-](\d{1,2})/);
      if (!dm) continue;
      if (+dm[1] !== ty || +dm[2] !== tm || +dm[3] !== td) continue;
    }

    let title = "";
    // 画像のalt属性にタイトルが入っていることが多い
    if (conf.preferAlt) {
      const img = m[2].match(/<img[^>]+alt=["']([^"']+)["']/i);
      if (img) title = clean(img[1]);
    }
    if (!title) title = clean(m[2]);
    if (!title || looksLikeJunk(title)) continue;
    // 規約系リンク等の除外
    if (conf.titleBlacklist && conf.titleBlacklist.some((b) => title.indexOf(b) >= 0)) continue;

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

// 抽出結果が少ない場合にフォールバックRSSから補完する
async function withFallback(items, conf, debug) {
  if (!conf.fallbackRss || items.length >= 3) return items;
  try {
    const fres = await fetch(conf.fallbackRss, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "application/rss+xml, application/xml, */*;q=0.8",
      },
    });
    debug.fallbackStatus = fres.status;
    if (fres.ok) {
      const fitems = parseRss(await fres.text(), conf.limit);
      if (fitems.length > items.length) {
        debug.source = "fallback_rss";
        debug.count = fitems.length;
        return fitems;
      }
    }
  } catch (e) {
    debug.fallbackError = String(e).slice(0, 120);
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

    let items = parse(html, conf);
    debug.count = items.length;
    debug.source = "html";

    // 記事一覧がJS描画等でほぼ拾えない場合はフォールバックRSSへ
    items = await withFallback(items, conf, debug);

    const body = { updatedAt: new Date().toISOString(), items };
    if (debugOn) body.debug = debug;

    return new Response(JSON.stringify(body), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        // 空のときはキャッシュしない（次のアクセスで再試行）
        "Cache-Control": items.length > 0 ? "public, max-age=900" : "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    // 本体ページの取得自体が失敗(403等)してもフォールバックRSSを試す
    let items = [];
    try {
      items = await withFallback([], conf, debug);
    } catch (e2) {}
    const body = { updatedAt: new Date().toISOString(), items };
    if (items.length === 0) body.error = String(e);
    if (debugOn) body.debug = debug;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": items.length > 0 ? "public, max-age=900" : "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}
