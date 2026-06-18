// ============================================================
// 業界リリース情報（AI調べ）Function（Claude + Web検索）
// ------------------------------------------------------------
// Claude（Anthropic API）のWeb検索ツールを使い、直近24時間以内の
// 日本国内ホテル・リゾートマーケットに関する重要ニュースを最大5件、
// 「見出し・要点・ソースURL」のJSONで取得して返します。
//
// 呼び出し: GET /api/release
//   &debug=1 で診断情報を返します（調整用）。
//
// ※APIキーは Cloudflare Pages の環境変数 ANTHROPIC_API_KEY に
//   設定してください（コードには埋め込みません）。
// ※毎朝8時(JST)に更新されるようキャッシュします。
// ============================================================

// 翌朝8時(JST)までの秒数（毎朝8時に更新されるようにキャッシュ）
function secondsUntilNext8amJST() {
  const nowJst = new Date(Date.now() + 9 * 3600000);
  const next = new Date(nowJst);
  next.setUTCHours(8, 0, 0, 0); // JSTの8:00（nowJstはUTC+9をUTCとして扱っている）
  if (next <= nowJst) next.setUTCDate(next.getUTCDate() + 1);
  return Math.max(60, Math.floor((next - nowJst) / 1000));
}

// 調査を依頼するプロンプト（毎朝8時に実行する想定の内容）
const PROMPT = `以下の条件で、日本国内のホテル・リゾートマーケットに影響を与える重要ニュースを調査してください。

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

必ずWeb検索ツールで最新情報を調べてから回答してください。
最終的な回答は、次の形式のJSON配列「のみ」を出力してください（前後に説明文やコードブロック記号を付けないこと）。
[
  {"title": "見出し", "summary": "要点（1〜2文）", "url": "https://..."}
]
該当するニュースが見つからない場合は、空配列 [] のみを出力してください。`;

// レスポンスの content からテキスト部分を結合
function collectText(content) {
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b && b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
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

  const key = context.env && context.env.ANTHROPIC_API_KEY;
  if (!key) {
    return jsonResponse({ items: [], error: "no_api_key" });
  }

  try {
    // Claude（Web検索ツール付き）へ調査を依頼。
    // サーバー側ツール実行で pause_turn になる場合があるため数回まで継続する。
    let messages = [{ role: "user", content: PROMPT }];
    let data = null;
    let lastStop = "";
    for (let i = 0; i < 5; i++) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-opus-4-8",
          max_tokens: 4000,
          tools: [{ type: "web_search_20260209", name: "web_search" }],
          messages,
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        const body = { items: [], error: "api_error", status: res.status };
        if (debugOn) body.detail = errText.slice(0, 800);
        return jsonResponse(body);
      }
      data = await res.json();
      lastStop = data.stop_reason || "";
      // サーバー側ツールが上限に達した場合は会話を継続して再送
      if (lastStop === "pause_turn") {
        messages = [
          { role: "user", content: PROMPT },
          { role: "assistant", content: data.content },
        ];
        continue;
      }
      break;
    }

    const text = collectText(data && data.content);
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
      body.debug = { stop_reason: lastStop, textLength: text.length, rawCount: raw.length };
    }

    return jsonResponse(body, {
      // 毎朝8時(JST)に更新（それまではキャッシュ）
      "Cache-Control": "public, max-age=" + secondsUntilNext8amJST(),
    });
  } catch (e) {
    return jsonResponse({ updatedAt: new Date().toISOString(), items: [], error: String(e) });
  }
}
