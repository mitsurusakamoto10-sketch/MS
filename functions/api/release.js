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

// 使用モデル（無料枠で使えるFlash）
// ※Gemini 3 Flashはこの無料キーではグラウンディング付き呼び出しが429
//   （クォータ/課金エラー）になるため、無料で確実に動く2.5-flashを採用。
//   将来 課金設定や無料枠拡大で3系が使えるようになれば先頭に追加可能。
const GEMINI_MODELS = ["gemini-2.5-flash"];

// 翌朝8時(JST)までの秒数（毎朝8時に更新されるようにキャッシュ）
function secondsUntilNext8amJST() {
  const nowJst = new Date(Date.now() + 9 * 3600000);
  const next = new Date(nowJst);
  next.setUTCHours(8, 0, 0, 0); // JSTの8:00（nowJstはUTC+9をUTCとして扱っている）
  if (next <= nowJst) next.setUTCDate(next.getUTCDate() + 1);
  return Math.max(60, Math.floor((next - nowJst) / 1000));
}

// 調査を依頼するプロンプト（実行時の現在日時を毎回埋め込み、常に最新を取得）
// ※調査内容（対象・観点）は固定。時間軸だけを実行時の現在日時(JST)に
//   アンカーし、24時間より前の古い記事は除外させる。
function pad2(n) {
  return n < 10 ? "0" + n : "" + n;
}
// JSTの日時文字列（例：2026-06-22 15:30）を返す。dは UTC+9 を加算済みの Date。
function fmtJst(d) {
  return (
    d.getUTCFullYear() +
    "-" +
    pad2(d.getUTCMonth() + 1) +
    "-" +
    pad2(d.getUTCDate()) +
    " " +
    pad2(d.getUTCHours()) +
    ":" +
    pad2(d.getUTCMinutes())
  );
}

function buildPrompt() {
  const nowJst = new Date(Date.now() + 9 * 3600000);       // 現在(JST)
  const cutoffJst = new Date(nowJst.getTime() - 72 * 3600000); // 72時間前(JST)
  const nowStr = fmtJst(nowJst);
  const cutoffStr = fmtJst(cutoffJst);

  return `あなたは不動産・観光業界のリサーチャーです。Google検索を使って最新情報を調べ、以下の条件でニュースをまとめてください。

【現在日時】
現在は ${nowStr}（日本時間）です。これを「今」として扱ってください。

【検索対象（期間）】
${cutoffStr} 〜 ${nowStr}（日本時間／直近72時間・3日以内）に公表・報道された情報の中から、日本国内のホテル・リゾートマーケットに影響を与える重要ニュースを検索してください。以下の観点を重視してください。
- ホテル開発 / リゾート開発 / 観光 / 旅行需要 / インバウンド動向 / 宿泊投資 / 政策 / インフラ / 労働需給 / 市況変化

【情報源】
- 日経新聞などの全国紙・大手報道機関を優先
- 必要に応じて日本各地の地方新聞も含める

【特に重視する点】
ホテル開発・リゾート開発に関するニュースでは、新規開発計画・開業・再開発計画・投資決定・提携・規制変更・インフラ整備など、新規性の高い具体的な新事実を含む報道を優先してください。単なる再掲や表面的なまとめは避けてください。

【除外条件】
- 広告色・PR色の強い記事は除外
- 公開日時が ${cutoffStr}（日本時間）より前の古い記事は必ず除外（過去の出来事の振り返り・再掲・まとめ記事も除外）

【出力条件】
- 必ず各記事の公開日時を確認し、${cutoffStr} 以降（直近72時間・3日以内）に公表された情報だけを対象にする
- 重要度の高いニュースを最大5件
- 日本語で要約
- 各ニュースについて「見出し」「要点（1〜2文）」「ソースURL」「公開日(日本時間)」を記載
- 公開日は実際の記事の公開日（日本時間）を "YYYY-MM-DD" 形式で記載する。日付が確認できない場合は空文字 "" にする

必ずGoogle検索で最新情報を調べてから回答してください。古い情報や日付が確認できない情報は採用しないでください。
最終的な回答は、次の形式のJSON配列「のみ」を出力してください（前後に説明文やコードブロック記号を付けないこと）。
[
  {"title": "見出し", "summary": "要点（1〜2文）", "url": "https://...", "date": "YYYY-MM-DD"}
]
該当するニュースが見つからない場合は、空配列 [] のみを出力してください。`;
}

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

// last-good キャッシュのキー（直近の成功結果を保存/取得）
function releaseCacheKey() {
  return new Request("https://release.local/industry-news-lastgood-v1");
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
    // 最新の無料Flashを優先し、利用不可なら従来モデルへフォールバック
    const reqBody = JSON.stringify({
      contents: [{ role: "user", parts: [{ text: buildPrompt() }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.2 },
    });

    let res = null;
    let usedModel = null;
    const tries = [];
    for (const model of GEMINI_MODELS) {
      const endpoint =
        "https://generativelanguage.googleapis.com/v1beta/models/" +
        model +
        ":generateContent?key=" +
        encodeURIComponent(key);
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: reqBody,
      });
      if (r.ok) {
        res = r;
        usedModel = model;
        tries.push({ model: model, status: r.status });
        break;
      }
      const errSnippet = await r.text();
      tries.push({ model: model, status: r.status, error: errSnippet.slice(0, 220) });
    }

    if (!res) {
      // クォータ切れ(429)等でGemini呼び出し失敗：直近の成功結果(last-good)を返す
      if (!debugOn) {
        const cached = await caches.default.match(releaseCacheKey());
        if (cached) {
          const prev = await cached.json();
          prev.stale = true;
          return jsonResponse(prev, { "Cache-Control": "public, max-age=600" });
        }
      }
      const body = { items: [], error: "api_error" };
      if (debugOn) body.tries = tries;
      return jsonResponse(body, { "Cache-Control": "no-store" });
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
        date: it.date ? String(it.date) : "",
      }));

    const body = { updatedAt: new Date().toISOString(), items };
    if (debugOn) {
      body.debug = {
        model: usedModel,
        tries: tries,
        finishReason:
          data.candidates && data.candidates[0] && data.candidates[0].finishReason,
        textLength: text.length,
        rawCount: raw.length,
      };
    }

    // 成功かつ件数ありなら last-good として保存（クォータ切れ時のフォールバック用）
    if (items.length > 0 && !debugOn && context.waitUntil) {
      context.waitUntil(
        caches.default.put(
          releaseCacheKey(),
          jsonResponse(body, { "Cache-Control": "max-age=604800" })
        )
      );
    }

    return jsonResponse(body, {
      // debug時はキャッシュ無効。通常は毎朝8時まで。
      "Cache-Control": debugOn ? "no-store" : "public, max-age=" + secondsUntilNext8amJST(),
    });
  } catch (e) {
    // 例外時も last-good があれば返す
    if (!debugOn) {
      try {
        const cached = await caches.default.match(releaseCacheKey());
        if (cached) {
          const prev = await cached.json();
          prev.stale = true;
          return jsonResponse(prev, { "Cache-Control": "public, max-age=600" });
        }
      } catch (e2) {}
    }
    return jsonResponse(
      { updatedAt: new Date().toISOString(), items: [], error: String(e) },
      { "Cache-Control": "no-store" }
    );
  }
}
