// ============================================================
// 上場REIT(投資法人)の開示書類一覧 Function（EDINET API v2）
// ------------------------------------------------------------
// EDINET API から直近10日間の提出書類を取得し、提出者名に
// 「投資法人」を含むもの（=上場REIT等）の題名のみを返します。
//
// 呼び出し: GET /api/reit
//
// ※EDINET API v2 はAPIキー(Subscription-Key)が必須です。
//   Cloudflare Pages の環境変数 EDINET_API_KEY に設定してください。
// ※EDINETは「法定開示書類(有報・臨時報告書等)」が対象で、
//   物件取得などの「適時開示(TDnet)」とは異なります。
// ============================================================

function pad(n) {
  return n < 10 ? "0" + n : "" + n;
}
function ymd(d) {
  return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
}

// 翌朝8時(JST)までの秒数（毎朝8時に更新されるようにキャッシュ）
function secondsUntilNext8amJST() {
  const nowJst = new Date(Date.now() + 9 * 3600000);
  const next = new Date(nowJst);
  next.setUTCHours(8, 0, 0, 0); // JSTの8:00（nowJstはUTC+9をUTCとして扱っている）
  if (next <= nowJst) next.setUTCDate(next.getUTCDate() + 1);
  return Math.max(60, Math.floor((next - nowJst) / 1000));
}

export async function onRequest(context) {
  const key = context.env && context.env.EDINET_API_KEY;

  // 診断用: /api/reit?debug=1 でキーの「有無と長さ」だけ返す（値は返さない）
  if (new URL(context.request.url).searchParams.get("debug") === "1") {
    // バインドされている環境変数の「名前と文字数」だけを列挙（値は出さない）
    const envNames = {};
    try {
      for (const k of Object.keys(context.env || {})) {
        const v = context.env[k];
        envNames[k] = typeof v === "string" ? v.length : typeof v;
      }
    } catch (e) {}
    return new Response(
      JSON.stringify({
        hasKey: !!key,
        keyLength: key ? String(key).length : 0,
        envVars: envNames,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  if (!key) {
    return new Response(
      JSON.stringify({ items: [], error: "no_api_key" }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  // 直近10日分の日付（JST基準）
  const baseJst = new Date(Date.now() + 9 * 3600000);
  const dates = [];
  for (let i = 0; i < 10; i++) {
    dates.push(ymd(new Date(baseJst.getTime() - i * 86400000)));
  }

  try {
    const lists = await Promise.all(
      dates.map(async (date) => {
        const url =
          "https://api.edinet-fsa.go.jp/api/v2/documents.json?date=" +
          date +
          "&type=2&Subscription-Key=" +
          encodeURIComponent(key);
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        const results = (data && data.results) || [];
        return results
          .filter(
            (r) =>
              r.filerName &&
              r.filerName.indexOf("投資法人") >= 0 &&
              r.docDescription
          )
          .map((r) => ({
            docID: r.docID,
            filer: r.filerName,
            title: r.docDescription,
            submit: r.submitDateTime || "",
            ts: Date.parse((r.submitDateTime || "").replace(" ", "T") + "+09:00"),
          }));
      })
    );

    let items = [].concat.apply([], lists);
    items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    items = items.slice(0, 30).map((it) => ({
      date: it.submit ? it.submit.slice(5, 10).replace("-", "/") : "",
      title: it.filer + "：" + it.title,
      link: "/api/edinet-doc?docID=" + encodeURIComponent(it.docID),
    }));

    return new Response(
      JSON.stringify({ updatedAt: new Date().toISOString(), items }),
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          // 毎朝8時(JST)に更新（それまではキャッシュ）
          "Cache-Control": "public, max-age=" + secondsUntilNext8amJST(),
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ updatedAt: new Date().toISOString(), items: [], error: String(e) }),
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
