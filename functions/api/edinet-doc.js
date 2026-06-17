// ============================================================
// EDINET 書類(PDF)中継 Function
// ------------------------------------------------------------
// APIキーをブラウザに見せないため、サーバー側でEDINETの
// PDFを取得してそのまま返します。
//
// 呼び出し: GET /api/edinet-doc?docID=XXXXXXXXXX
// ============================================================

export async function onRequest(context) {
  const key = context.env && context.env.EDINET_API_KEY;
  const docID = new URL(context.request.url).searchParams.get("docID");
  if (!key || !docID) {
    return new Response("missing key or docID", { status: 400 });
  }

  const url =
    "https://api.edinet-fsa.go.jp/api/v2/documents/" +
    encodeURIComponent(docID) +
    "?type=2&Subscription-Key=" +
    encodeURIComponent(key);

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return new Response("EDINET error: " + res.status, { status: res.status });
    }
    return new Response(res.body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (e) {
    return new Response("fetch error", { status: 502 });
  }
}
