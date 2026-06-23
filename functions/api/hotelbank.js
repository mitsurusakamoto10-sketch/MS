// ============================================================
// HotelBank 最新ニュース Function（RSS取得 + Gemini重要度判定）
// ------------------------------------------------------------
// HotelBank(hotelbank.jp)のRSS/カテゴリフィードから実在記事
// （タイトル・URL・公開/更新日時）を集め、「新規開業・供給・
// 投資・開発」の観点で重要な記事をGeminiに最大6件選ばせて返します。
// Geminiには実在記事のリストだけを渡し「番号(index)」で選ばせるため、
// URL・日時は正確なまま（捏造が起きない構成）です。
//
// 呼び出し: GET /api/hotelbank
//   &fresh=... でキャッシュ回避、&debug=1 で診断情報を返します。
//
// ※Gemini失敗時はRSS新着順の6件にフォールバックします。
//   GEMINI_API_KEY（設定済み）を使用します。
// ============================================================

const GEMINI_MODEL = "gemini-2.5-flash";

// 取得するRSSフィード（カテゴリ別 + サイト全体）
const FEEDS = [
  "https://hotelbank.jp/new-hotels/feed/",
  "https://hotelbank.jp/supply-pipeline/feed/",
  "https://hotelbank.jp/investment/feed/",
  "https://hotelbank.jp/development/feed/",
  "https://hotelbank.jp/feed/",
];

// 対象テーマ（URLスラッグ / カテゴリ名のいずれかに一致すれば採用）
const TARGET_SLUGS = ["new-hotels", "supply-pipeline", "investment", "development"];
const TARGET_CAT_WORDS = ["開業", "供給", "投資", "開発"];

const MAX_CANDIDATES = 30; // Geminiに渡す候補の上限
const MAX_ITEMS = 6;       // 最終的に表示する件数

function pad2(n) {
  return n < 10 ? "0" + n : "" + n;
}

// 翌朝8時(JST)までの秒数（毎朝8時に更新されるようにキャッシュ）
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
    String(s)
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\s+/g, " ")
    .trim();
}

// <item>...</item> の中から指定タグの中身を取り出す
function pick(block, tag) {
  const re = new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)</" + tag + ">", "i");
  const m = block.match(re);
  return m ? m[1] : "";
}

// pubDate(RFC822) などを JST の YYYY-MM-DD に変換
function toJstYmd(pub) {
  if (!pub) return "";
  const t = Date.parse(pub);
  if (isNaN(t)) return "";
  const j = new Date(t + 9 * 3600000);
  return (
    j.getUTCFullYear() + "-" + pad2(j.getUTCMonth() + 1) + "-" + pad2(j.getUTCDate())
  );
}

// RSS本文から記事を抽出
function parseRss(xml) {
  const items = [];
  const itemRe = /<item\b[\s\S]*?<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[0];
    const title = clean(pick(block, "title"));
    const link = clean(pick(block, "link"));
    const pub = clean(pick(block, "pubDate")) || clean(pick(block, "dc:date"));
    if (!title || !link) continue;
    const cats = [];
    const catRe = /<category[^>]*>([\s\S]*?)<\/category>/gi;
    let cm;
    while ((cm = catRe.exec(block)) !== null) {
      const c = clean(cm[1]);
      if (c) cats.push(c);
    }
    items.push({ title, link, date: toJstYmd(pub), ts: Date.parse(pub) || 0, cats });
  }
  return items;
}

function isTarget(it) {
  const inSlug = TARGET_SLUGS.some((s) => it.link.indexOf("/" + s + "/") >= 0);
  const inCat = it.cats.some((c) =>
    TARGET_CAT_WORDS.some((w) => c.indexOf(w) >= 0)
  );
  return inSlug || inCat;
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

// Geminiレスポンスからテキストを結合
function collectText(data) {
  const parts =
    data &&
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((p) => p && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n");
}

// テキストから数値のJSON配列（選ばれたindex）を取り出す
function extractIndices(text) {
  if (!text) return [];
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end < 0 || end < start) return [];
  try {
    const arr = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(arr)) return [];
    return arr.map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));
  } catch (e) {
    return [];
  }
}

// Geminiに重要度で並べ替え・選定させる（候補のindexを返す）
async function rankWithGemini(key, candidates) {
  const list = candidates
    .map(
      (it, i) =>
        i +
        ". [" +
        (it.date || "日付不明") +
        "] " +
        it.title +
        (it.cats.length ? "（カテゴリ: " + it.cats.join("・") + "）" : "")
    )
    .join("\n");

  const prompt = `あなたはホテル業界のアナリストです。以下はHotelBankの最新記事リストです。
「新規開業・供給・投資・開発」に関する、重要度の高い記事を最大${MAX_ITEMS}件選んでください。
重要度の高い順に、選んだ記事の番号(index)だけを次の形式のJSON配列「のみ」で出力してください（説明文やコードブロック記号は付けないこと）。
例: [3, 0, 7, 1, 5, 2]

記事リスト:
${list}`;

  const endpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    GEMINI_MODEL +
    ":generateContent?key=" +
    encodeURIComponent(key);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1 },
    }),
  });
  if (!res.ok) throw new Error("gemini status " + res.status);
  const data = await res.json();
  return extractIndices(collectText(data));
}

export async function onRequest(context) {
  const reqUrl = new URL(context.request.url);
  const debugOn = reqUrl.searchParams.get("debug");
  const debug = { feeds: {}, candidateCount: 0, ranked: false, geminiError: null };

  try {
    // 1) RSSを並行取得して候補を収集
    const results = await Promise.all(
      FEEDS.map(async (url) => {
        try {
          const res = await fetch(url, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
              "Accept-Language": "ja,en;q=0.8",
              Accept: "application/rss+xml, application/xml, text/xml, */*",
            },
          });
          if (!res.ok) {
            debug.feeds[url] = "status " + res.status;
            return [];
          }
          const xml = await res.text();
          const parsed = parseRss(xml);
          debug.feeds[url] = parsed.length;
          return parsed;
        } catch (e) {
          debug.feeds[url] = "err " + String(e);
          return [];
        }
      })
    );

    // 2) 統合・重複排除・対象テーマに限定・新しい順
    const byLink = new Map();
    for (const it of [].concat.apply([], results)) {
      if (!isTarget(it)) continue;
      if (!byLink.has(it.link)) byLink.set(it.link, it);
    }
    let candidates = Array.from(byLink.values());
    candidates.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    candidates = candidates.slice(0, MAX_CANDIDATES);
    debug.candidateCount = candidates.length;

    if (candidates.length === 0) {
      const body = { updatedAt: new Date().toISOString(), items: [] };
      if (debugOn) body.debug = debug;
      return jsonResponse(body);
    }

    // 3) Geminiで重要度判定（失敗時はRSS新着順にフォールバック）
    let chosen = candidates.slice(0, MAX_ITEMS);
    const key = context.env && context.env.GEMINI_API_KEY;
    if (key) {
      try {
        const idx = await rankWithGemini(key, candidates);
        const picked = [];
        const used = new Set();
        for (const i of idx) {
          if (i >= 0 && i < candidates.length && !used.has(i)) {
            used.add(i);
            picked.push(candidates[i]);
          }
          if (picked.length >= MAX_ITEMS) break;
        }
        if (picked.length > 0) {
          chosen = picked;
          debug.ranked = true;
        }
      } catch (e) {
        debug.geminiError = String(e);
      }
    } else {
      debug.geminiError = "no_api_key";
    }

    const items = chosen.map((it) => ({
      title: it.title,
      link: it.link,
      date: it.date || "",
    }));

    const body = { updatedAt: new Date().toISOString(), items };
    if (debugOn) body.debug = debug;

    return jsonResponse(body, {
      "Cache-Control": "public, max-age=" + secondsUntilNext8amJST(),
    });
  } catch (e) {
    const body = { updatedAt: new Date().toISOString(), items: [], error: String(e) };
    if (debugOn) body.debug = debug;
    return jsonResponse(body);
  }
}
