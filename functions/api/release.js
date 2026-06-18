// ============================================================
// 業界リリース情報（AI調べ）Function（Google Gemini + Web検索）
// ------------------------------------------------------------
// Google Gemini（無料枠）のGoogle検索グラウンディングを使い、直近
// 24時間以内の日本国内ホテル・リゾートマーケットの重要ニュースを
// 最大5件、「見出し・要点・ソースURL」のJSONで取得して返します。
//
// 呼び出し: GET /api/release
//   &debug=1 で診断情報を返します（調整用）。
//
// ※APIキーは無料で取得できます（Google AI Studio）。
//   Cloudflare Pages の環境変数 GEMINI_API_KEY に設定してください
//   （コードには埋め込みません）。無料枠の範囲で利用します。
// ※毎朝8時(JST)に更新されるようキャッシュします。
// ============================================================

// 使用モデル（無料枠で利用可能なFlash系）
const GEMINI_MODEL = "gemini-2.5-flash";

// 翌朝8時(JST)までの秒数（毎朝8時に更新されるようにキャッシュ）
function secondsUntilNext8amJST() {
  const nowJst = new Date(Date.now() + 9 * 3600000);
  const next = new Date(nowJst);
  next.setUTCHours(8, 0, 0, 0); // JSTの8:00（nowJstはUTC+9をUTCとして扱っている）
  if (next <= nowJst) next.setUTCDate(next.getUTCDate() + 1);
  return Math.max(60, Math.floor((next - nowJst) / 1000));
}

// 調査を依頼するプロンプト（毎朝8時に実行する想定の内容）
const PROMPT = `あなたは不動産・観光業界のリサーチャーです。Google検索を使って最新情報を調べ、以下の条件でニュースをまとめてください。

【検索対象】
直近24時間以内に公表・報道された情報の中から、日本国内のホテル・リゾートマーケットに影響を与える重要ニュースを検索してください。以下の観点を重視してください。
- ホテル開発 / リゾート開発 / 観光 / 旅行需要 / インバウンド動向 / 宿泊投資 / 政策 / インフラ / 労働需給 / 市況変化

【情報源】
- 日経新聞などの全国紙・大手報道機関を優先
- 必要に応じて日本各地の地方新聞も含める

【特に重視する点】
ホテル開発・リゾート開発に関するニュースでは、新規開発計画・開業・再開発計画・投資決定・提携・規制変更・インフラ整備など、新規性の高い具体的な新事実を含む報道を優先してください。単なる再掲や表面的なまとめは避けてください。

【除外条件】
- 広告色・PR色の強い記事は除外

【出力条件】
- 直近24時間以内の情報を最優先
- 重要度の高いニュースを最大5件
- 日本語で要約
- 各ニュースについて「見出し」「要点（1〜2文）」「ソースURL」を記載

必ずGoogle検索で最新情報を調べてから回答してください。
最終的な回答は、次の形式のJSON配列「のみ」を出力してください（前後に説明文やコードブロック記号を付けないこと）。
[
  {"title": "見出し", "summary": "要点（1〜2文）", "url": "https://..."}
]
該当するニュースが見つからない場合は、空配列 [] のみを出力してください。`;

// レスポンスからテキスト部分を結合
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

// テキストからJSON配列を抽出してパース
function extractItems(text) {
  if (!text) return [];
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end < 0 || end < start) return [];
  try {
    const arr = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
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

  const key = context.env && context.env.GEMINI_API_KEY;
  if (!key) {
    return jsonResponse({ items: [], error: "no_api_key" });
  }

  try {
    // Gemini（Google検索グラウンディング付き）へ調査を依頼
    const endpoint =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      GEMINI_MODEL +
      ":generateContent?key=" +
      encodeURIComponent(key);

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: PROMPT }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.2 },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      const body = { items: [], error: "api_error", status: res.status };
      if (debugOn) body.detail = errText.slice(0, 800);
      return jsonResponse(body);
    }

    const data = await res.json();
    const text = collectText(data);
    const raw = extractItems(text);

    const items = raw
      .filter((it) => it && it.title && it.url && /^https?:\/\//i.test(it.url))
      .slice(0, 5)
      .map((it) => ({
        title: String(it.title),
        summary: it.summary ? String(it.summary) : "",
        link: String(it.url),
      }));

    const body = { updatedAt: new Date().toISOString(), items };
    if (debugOn) {
      body.debug = {
        finishReason:
          data.candidates && data.candidates[0] && data.candidates[0].finishReason,
        textLength: text.length,
        rawCount: raw.length,
      };
    }

    return jsonResponse(body, {
      // 毎朝8時(JST)に更新（それまではキャッシュ）
      "Cache-Control": "public, max-age=" + secondsUntilNext8amJST(),
    });
  } catch (e) {
    return jsonResponse({
      updatedAt: new Date().toISOString(),
      items: [],
      error: String(e),
    });
  }
}
