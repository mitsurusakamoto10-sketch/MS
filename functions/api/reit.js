// ============================================================
// 上場REIT(投資法人)の開示書類一覧 Function（EDINET API v2）
// ------------------------------------------------------------
// EDINET API から直近1か月(30日)間の提出書類を取得し、提出者名に
// 「投資法人」を含むもの（=上場REIT等）のうち、
// 「物件の取得・売却・賃貸借」に関する開示の題名のみを返します。
// （題名 docDescription が PROPERTY_KEYWORDS のいずれかを含むもの）
//
// 呼び出し: GET /api/reit
//
// ※EDINET API v2 はAPIキー(Subscription-Key)が必須です。
//   Cloudflare Pages の環境変数 EDINET_API_KEY に設定してください。
// ※EDINETは「法定開示書類(有報・臨時報告書等)」が対象で、
//   物件取得などの詳細は「適時開示(TDnet)」が中心です。EDINETの
//   題名に取引種別が現れないことも多く、該当件数は少なめになります。
// ============================================================

function pad(n) {
  return n < 10 ? "0" + n : "" + n;
}
function ymd(d) {
  return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
}

// 物件の「取得・売却・賃貸借」に関する開示だけを抽出するためのキーワード
// （題名 docDescription に下記のいずれかを含むものだけを対象にする）
const PROPERTY_KEYWORDS = [
  "取得",      // 物件取得
  "売却",      // 物件売却
  "譲渡",      // 物件譲渡（売却）
  "処分",      // 資産の処分（売却）
  "賃貸借",    // 賃貸借契約
  "賃貸",      // 賃貸
  "リース",    // リース
  "信託受益権", // 不動産信託受益権の取得/譲渡
];

function isPropertyDeal(desc) {
  if (!desc) return false;
  return PROPERTY_KEYWORDS.some((kw) => desc.indexOf(kw) >= 0);
}

// 対象とする開示か判定
// ・題名に物件取引キーワードを含む、または
// ・投資法人の「臨時報告書」（REITの臨時報告書は主に資産の取得・譲渡の報告で、
//   EDINETの題名は「臨時報告書」とだけ書かれ取引種別が題名に出ないため、これも対象にする）
function isTargetDisclosure(desc) {
  if (!desc) return false;
  return isPropertyDeal(desc) || desc.indexOf("臨時報告書") >= 0;
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

  // 直近1か月（30日）分の日付（JST基準）
  const baseJst = new Date(Date.now() + 9 * 3600000);
  const dates = [];
  for (let i = 0; i < 30; i++) {
    dates.push(ymd(new Date(baseJst.getTime() - i * 86400000)));
  }

  // 診断用: /api/reit?dump=1 で投資法人の全提出書類（題名付き）を一覧（フィルタ前）
  const dump = new URL(context.request.url).searchParams.get("dump") === "1";

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
        // まず投資法人の提出書類をすべて集める（フィルタは後段）
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

    let all = [].concat.apply([], lists);
    all.sort((a, b) => (b.ts || 0) - (a.ts || 0));

    // 診断: 投資法人の全書類（題名そのまま）を返す
    if (dump) {
      return new Response(
        JSON.stringify(
          {
            count: all.length,
            items: all.map((it) => ({
              date: it.submit ? it.submit.slice(0, 10) : "",
              filer: it.filer,
              doc: it.title,
              hit: isTargetDisclosure(it.title),
            })),
          },
          null,
          2
        ),
        {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // 物件取引（取得・売却・賃貸借）＋投資法人の臨時報告書に限定
    let items = all
      .filter((it) => isTargetDisclosure(it.title))
      .slice(0, 60)
      .map((it) => ({
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
