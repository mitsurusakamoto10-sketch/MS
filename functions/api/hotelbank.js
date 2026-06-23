// ============================================================
// HotelBank 最新ニュース Function（HTML一覧取得 + Gemini重要度判定）
// ------------------------------------------------------------
// HotelBank(hotelbank.jp)の記事一覧ページから実在記事
// （タイトル・URL・公開/更新日時）を集め、「新規開業・供給・
// 投資・開発」の観点で重要な記事をGeminiに最大6件選ばせて返します。
// Geminiには実在記事のリストだけを渡し「番号(index)」で選ばせるため、
// URL・日時は正確なまま（捏造が起きない構成）です。
//
// 呼び出し: GET /api/hotelbank
//   &fresh=... でキャッシュ回避、&debug=1 で診断情報、
//   &raw=1 で取得HTMLの一部を返します（調整用）。
//
// ※Gemini失敗時は新着順の6件にフォールバックします。
//   ※RSS(/feed/)は500/404のため使わず、HTML一覧を解析します。
// ============================================================

const GEMINI_MODEL = "gemini-2.5-flash";

// 記事一覧の取得元（順に試す）
const PAGES = ["https://hotelbank.jp/newlist/", "https://hotelbank.jp/"];
const BASE = "https://hotelbank.jp";

// 記事URLのパターン（先頭セグメントが対象カテゴリ + 記事スラッグ）
const ARTICLE_RE =
  /^https?:\/\/hotelbank\.jp\/(new-hotels|supply-pipeline|investment|development|news)\/[a-z0-9][a-z0-9\-]{3,}\/?$/i;

// 対象テーマ（重要度判定の前段フィルタ：URLスラッグで判定）
const TARGET_SLUGS = ["new-hotels", "supply-pipeline", "investment", "development"];

const MAX_CANDIDATES = 30; // Geminiに渡す候補の上限
const MAX_ITEMS = 6;       // 最終的に表示する件数

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
  return decodeEntities(String(s).replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

// 日付パターン（2026.06.20 / 2026-06-20 / 2026年6月20日）を YYYY-MM-DD に
function findDate(ctx) {
  let m = ctx.match(/(20\d{2})[.\/\-](\d{1,2})[.\/\-](\d{1,2})/);
  if (!m) m = ctx.match(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (!m) return "";
  return m[1] + "-" + pad2(+m[2]) + "-" + pad2(+m[3]);
}

function looksLikeJunk(s) {
  return /[{}]|display\s*:|css-[a-z0-9]|@media|webkit/i.test(s);
}

// HTMLから記事候補を抽出
function parsePage(html) {
  const items = [];
  const seen = new Set();
  const anchorRe = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = anchorRe.exec(html)) !== null) {
    let url;
    try {
      url = new URL(m[1], BASE).href;
    } catch (e) {
      continue;
    }
    url = url.split("?")[0];
    if (!ARTICLE_RE.test(url)) continue;
    if (seen.has(url)) continue;

    // タイトル：画像alt → アンカーテキストの順
    let title = "";
    const img = m[2].match(/<img[^>]+alt=["']([^"']+)["']/i);
    if (img) title = clean(img[1]);
    if (!title) title = clean(m[2]);
    if (!title || title.length < 6 || looksLikeJunk(title)) continue;

    // 周辺テキストから日付を探す
    const ctx = html.slice(Math.max(0, m.index - 260), m.index + m[0].length + 260);
    const date = findDate(ctx);

    seen.add(url);
    items.push({ title, link: url, date });
    if (items.length >= MAX_CANDIDATES) break;
  }
  return items;
}

function isTarget(it) {
  return TARGET_SLUGS.some((s) => it.link.indexOf("/" + s + "/") >= 0);
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

async function rankWithGemini(key, candidates) {
  const list = candidates
    .map((it, i) => i + ". [" + (it.date || "日付不明") + "] " + it.title)
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

async function fetchPage(url) {
  return fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept-Language": "ja,en;q=0.8",
      Accept: "text/html,application/xhtml+xml",
    },
  });
}

export async function onRequest(context) {
  const reqUrl = new URL(context.request.url);
  const debugOn = reqUrl.searchParams.get("debug");
  const rawOn = reqUrl.searchParams.get("raw");
  const debug = { pages: {}, candidateCount: 0, ranked: false, geminiError: null };

  try {
    // 1) 記事一覧ページを順に取得して候補を収集
    let candidates = [];
    for (const page of PAGES) {
      try {
        const res = await fetchPage(page);
        if (!res.ok) {
          debug.pages[page] = "status " + res.status;
          continue;
        }
        const html = await res.text();
        if (rawOn) {
          return new Response(html.slice(0, 6000), {
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
        const parsed = parsePage(html).filter(isTarget);
        debug.pages[page] = { htmlLength: html.length, found: parsed.length };
        if (parsed.length > 0) {
          candidates = parsed;
          break;
        }
      } catch (e) {
        debug.pages[page] = "err " + String(e);
      }
    }

    candidates = candidates.slice(0, MAX_CANDIDATES);
    debug.candidateCount = candidates.length;

    if (candidates.length === 0) {
      const body = { updatedAt: new Date().toISOString(), items: [] };
      if (debugOn) body.debug = debug;
      return jsonResponse(body);
    }

    // 2) Geminiで重要度判定（失敗時は新着順にフォールバック）
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
