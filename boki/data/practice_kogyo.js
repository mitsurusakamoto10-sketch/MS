/* 分野別演習：工業簿記 問題プール（オリジナル問題） */
(function () {
  var qs = [
    /* ---- 工業簿記の仕訳 ---- */
    {
      id: "p-kg-1", kind: "journal", topic: "kogyo_shiwake", points: 4, maxLines: 4,
      question: "当月の材料消費額を計上する。直接材料としての消費額は ¥900,000、間接材料としての消費額は ¥100,000 であった。",
      accounts: ["仕掛品", "製造間接費", "材料", "製品", "買掛金", "材料消費価格差異"],
      correct: {
        debit: [{ a: "仕掛品", v: 900000 }, { a: "製造間接費", v: 100000 }],
        credit: [{ a: "材料", v: 1000000 }]
      },
      explanation: "直接材料費は仕掛品へ、間接材料費は製造間接費へ振り替える。"
    },
    {
      id: "p-kg-2", kind: "journal", topic: "kogyo_shiwake", points: 4, maxLines: 4,
      question: "当月の賃金 ¥1,300,000 について、源泉所得税などの預り金 ¥130,000 を控除した残額を現金で支払った。",
      accounts: ["賃金・給料", "預り金", "現金", "仕掛品", "製造間接費", "当座預金"],
      correct: {
        debit: [{ a: "賃金・給料", v: 1300000 }],
        credit: [{ a: "預り金", v: 130000 }, { a: "現金", v: 1170000 }]
      },
      explanation: "支払時は賃金・給料の総額を借方に計上し、控除額は預り金（負債）とする。"
    },
    {
      id: "p-kg-3", kind: "journal", topic: "kogyo_shiwake", points: 4, maxLines: 4,
      question: "外部の加工業者に依頼していた外注加工賃 ¥200,000 を現金で支払った。外注加工賃は直接経費として処理する。",
      accounts: ["仕掛品", "製造間接費", "現金", "外注加工賃", "買掛金"],
      correct: { debit: [{ a: "仕掛品", v: 200000 }], credit: [{ a: "現金", v: 200000 }] },
      explanation: "外注加工賃は直接経費なので、仕掛品勘定へ直接算入する。"
    },
    {
      id: "p-kg-4", kind: "journal", topic: "kogyo_shiwake", points: 4, maxLines: 4,
      question: "月末に材料の実地棚卸を行ったところ、帳簿残高 ¥350,000 に対して実地残高は ¥340,000 であった。差額は正常な棚卸減耗である。",
      accounts: ["製造間接費", "材料", "棚卸減耗損", "仕掛品", "雑損"],
      correct: { debit: [{ a: "製造間接費", v: 10000 }], credit: [{ a: "材料", v: 10000 }] },
      explanation: "材料の正常な棚卸減耗は間接経費として製造間接費で処理する。"
    },
    /* ---- 費目別計算 ---- */
    {
      id: "p-hm-1", kind: "cells", topic: "himoku",
      question: "材料に関する当月の資料は次のとおりである。平均法により、空欄を埋めなさい。\n\n月初在庫：50kg（@¥200）\n当月購入：450kg（@¥210）\n当月消費：400kg",
      body: `<table class="fill-table">
<tr><td>平均単価（円/kg）</td><td class="num">{{c1}}</td></tr>
<tr><td>当月の材料消費額（円）</td><td class="num">{{c2}}</td></tr>
<tr><td>月末材料有高（円）</td><td class="num">{{c3}}</td></tr>
</table>`,
      cells: {
        c1: { answer: 209, points: 2 },
        c2: { answer: 83600, points: 2 },
        c3: { answer: 20900, points: 2 }
      },
      explanation: "平均単価＝(50×200＋450×210)÷500kg＝104,500÷500＝209円/kg。消費額＝400×209＝83,600、月末有高＝100×209＝20,900。"
    },
    {
      id: "p-hm-2", kind: "cells", topic: "himoku",
      question: "直接工の賃金は予定賃率を用いて計算している。年間予定賃金総額は ¥14,400,000、年間予定総就業時間は 12,000時間である。当月の実際就業時間は 950時間、賃金の実際発生額は ¥1,152,000 であった。空欄を埋めなさい。",
      body: `<table class="fill-table">
<tr><td>予定賃率（円/時間）</td><td class="num">{{c1}}</td></tr>
<tr><td>当月の予定消費額（円）</td><td class="num">{{c2}}</td></tr>
<tr><td>賃率差異の金額（円・絶対値）</td><td class="num">{{c3}}</td></tr>
<tr><td>賃率差異の有利・不利</td><td>{{c4}}</td></tr>
</table>`,
      cells: {
        c1: { answer: 1200, points: 2 },
        c2: { answer: 1140000, points: 2 },
        c3: { answer: 12000, points: 2 },
        c4: { answer: "不利", points: 2, choices: ["有利", "不利"] }
      },
      explanation: "予定賃率＝14,400,000÷12,000時間＝1,200円/時。予定消費額＝1,200×950＝1,140,000。実際発生額 1,152,000 のほうが大きいので差異 12,000 は不利差異（借方差異）。"
    },
    /* ---- 部門別計算 ---- */
    {
      id: "p-bm-1", kind: "cells", topic: "bumon",
      question: "当工場には製造部門としてA部門・B部門、補助部門として動力部門がある。次の資料にもとづき、直接配賦法により空欄を埋めなさい。\n\n部門費（第1次集計費）：A部門 ¥900,000／B部門 ¥700,000／動力部門 ¥300,000\n動力供給量：A部門 800kWh／B部門 400kWh",
      body: `<table class="fill-table">
<tr><th>項目</th><th>A部門</th><th>B部門</th></tr>
<tr><td>部門費</td><td class="num">900,000</td><td class="num">700,000</td></tr>
<tr><td>動力部門費の配賦額</td><td class="num">{{c1}}</td><td class="num">{{c2}}</td></tr>
<tr><td>製造部門費合計</td><td class="num">{{c3}}</td><td class="num">{{c4}}</td></tr>
</table>`,
      cells: {
        c1: { answer: 200000, points: 2 },
        c2: { answer: 100000, points: 2 },
        c3: { answer: 1100000, points: 2 },
        c4: { answer: 800000, points: 2 }
      },
      explanation: "動力部門費 300,000 を供給量比 800:400（2:1）で配賦する。A＝200,000、B＝100,000。合計はA 1,100,000、B 800,000。"
    },
    /* ---- 個別原価計算 ---- */
    {
      id: "p-kb-1", kind: "cells", topic: "kobetsu",
      question: "製造間接費は直接作業時間を基準として予定配賦している。年間の製造間接費予算は ¥9,600,000、年間の予定直接作業時間は 8,000時間である。当月の実際直接作業時間は 650時間、製造間接費の実際発生額は ¥800,000 であった。空欄を埋めなさい。",
      body: `<table class="fill-table">
<tr><td>予定配賦率（円/時間）</td><td class="num">{{c1}}</td></tr>
<tr><td>当月の予定配賦額（円）</td><td class="num">{{c2}}</td></tr>
<tr><td>製造間接費配賦差異（円・絶対値）</td><td class="num">{{c3}}</td></tr>
<tr><td>配賦差異の有利・不利</td><td>{{c4}}</td></tr>
</table>`,
      cells: {
        c1: { answer: 1200, points: 2 },
        c2: { answer: 780000, points: 2 },
        c3: { answer: 20000, points: 2 },
        c4: { answer: "不利", points: 2, choices: ["有利", "不利"] }
      },
      explanation: "予定配賦率＝9,600,000÷8,000時間＝1,200円/時。予定配賦額＝1,200×650＝780,000。実際発生額 800,000 のほうが大きいので 20,000 の不利差異。"
    },
    /* ---- 総合原価計算 ---- */
    {
      id: "p-sg-1", kind: "cells", topic: "sogo",
      question: "単純総合原価計算を採用している。次の資料にもとづき、先入先出法により空欄を埋めなさい。直接材料は工程の始点で投入している。\n\n【生産データ】月初仕掛品 100個（加工進捗度50%）／当月投入 900個／完成品 800個／月末仕掛品 200個（加工進捗度50%）\n【原価データ】月初仕掛品：直接材料費 ¥21,000、加工費 ¥12,000／当月製造費用：直接材料費 ¥270,000、加工費 ¥255,000",
      body: `<table class="fill-table">
<tr><td>月末仕掛品の直接材料費（円）</td><td class="num">{{c1}}</td></tr>
<tr><td>月末仕掛品の加工費（円）</td><td class="num">{{c2}}</td></tr>
<tr><td>完成品総合原価（円）</td><td class="num">{{c3}}</td></tr>
<tr><td>完成品単位原価（円/個）</td><td class="num">{{c4}}</td></tr>
</table>`,
      cells: {
        c1: { answer: 60000, points: 2 },
        c2: { answer: 30000, points: 2 },
        c3: { answer: 468000, points: 2 },
        c4: { answer: 585, points: 2 }
      },
      explanation: "先入先出法では月末仕掛品は当月投入分から計算する。材料費：270,000÷900個＝300円/個 → 月末 200×300＝60,000。加工費の当月投入換算量＝800−100×50%＋200×50%＝850個 → 255,000÷850＝300円/個 → 月末 100個分＝30,000。完成品総合原価＝(21,000＋270,000−60,000)＋(12,000＋255,000−30,000)＝231,000＋237,000＝468,000。単位原価＝468,000÷800＝585円/個。"
    },
    {
      id: "p-sg-2", kind: "cells", topic: "sogo",
      question: "単純総合原価計算を採用している。当月投入 1,000個のうち 900個が完成し、100個は工程の終点で仕損となった（正常仕損・処分価値なし、月初・月末仕掛品はない）。当月製造費用は直接材料費 ¥500,000、加工費 ¥400,000 である。正常仕損費を完成品に負担させる場合の空欄を埋めなさい。",
      body: `<table class="fill-table">
<tr><td>完成品総合原価（円）</td><td class="num">{{c1}}</td></tr>
<tr><td>完成品単位原価（円/個）</td><td class="num">{{c2}}</td></tr>
</table>`,
      cells: {
        c1: { answer: 900000, points: 3 },
        c2: { answer: 1000, points: 3 }
      },
      explanation: "終点発生の正常仕損費は完成品がすべて負担するため、当月製造費用 900,000 の全額が完成品総合原価となる。単位原価＝900,000÷900個＝1,000円/個。"
    },
    /* ---- 標準原価計算 ---- */
    {
      id: "p-hj-1", kind: "cells", topic: "hyojun",
      question: "標準原価計算を採用しており、製造間接費は公式法変動予算を用いて分析している。次の資料にもとづき空欄を埋めなさい。能率差異は変動費と固定費の両方から計算すること。金額は絶対値で答えること。\n\n【資料】\n月間基準操業度 1,000時間（直接作業時間）／固定費予算（月額）¥600,000／変動費率 ¥400/時間\n当月実績：標準操業度 900時間、実際操業度 950時間、製造間接費実際発生額 ¥1,000,000",
      body: `<table class="fill-table">
<tr><th>差異</th><th>金額（円）</th><th>有利/不利</th></tr>
<tr><td>予算差異</td><td class="num">{{c1}}</td><td>{{c2}}</td></tr>
<tr><td>能率差異</td><td class="num">{{c3}}</td><td>{{c4}}</td></tr>
<tr><td>操業度差異</td><td class="num">{{c5}}</td><td>{{c6}}</td></tr>
</table>`,
      cells: {
        c1: { answer: 20000, points: 2 },
        c2: { answer: "不利", points: 1, choices: ["有利", "不利"] },
        c3: { answer: 50000, points: 2 },
        c4: { answer: "不利", points: 1, choices: ["有利", "不利"] },
        c5: { answer: 30000, points: 2 },
        c6: { answer: "不利", points: 1, choices: ["有利", "不利"] }
      },
      explanation: "標準配賦率＝400＋600,000÷1,000時間＝1,000円/時。予算差異＝実際操業度の予算許容額(600,000＋400×950＝980,000)−実際発生額1,000,000＝△20,000（不利）。能率差異＝(標準900−実際950)時間×1,000＝△50,000（不利）。操業度差異＝(実際950−基準1,000)時間×固定費率600＝△30,000（不利）。"
    },
    /* ---- 直接原価計算・CVP ---- */
    {
      id: "p-cv-1", kind: "cells", topic: "cvp",
      question: "当社の製品Zに関する資料は次のとおりである。空欄を埋めなさい。\n\n販売価格 @¥1,000／製品1個あたり変動費 @¥600／固定費 ¥1,200,000",
      body: `<table class="fill-table">
<tr><td>損益分岐点の販売量（個）</td><td class="num">{{c1}}</td></tr>
<tr><td>損益分岐点の売上高（円）</td><td class="num">{{c2}}</td></tr>
<tr><td>目標営業利益 ¥400,000 を達成する販売量（個）</td><td class="num">{{c3}}</td></tr>
</table>`,
      cells: {
        c1: { answer: 3000, points: 2 },
        c2: { answer: 3000000, points: 2 },
        c3: { answer: 4000, points: 2 }
      },
      explanation: "1個あたり貢献利益＝1,000−600＝400。損益分岐点販売量＝1,200,000÷400＝3,000個（売上高 3,000,000）。目標利益達成販売量＝(1,200,000＋400,000)÷400＝4,000個。"
    },
    {
      id: "p-cv-2", kind: "cells", topic: "cvp",
      question: "過去の実績データにもとづき、高低点法によって原価を変動費と固定費に分解する。\n\n最高操業度：生産量 5,000個のとき原価 ¥3,700,000\n最低操業度：生産量 3,000個のとき原価 ¥2,500,000",
      body: `<table class="fill-table">
<tr><td>製品1個あたりの変動費（円/個）</td><td class="num">{{c1}}</td></tr>
<tr><td>固定費（円）</td><td class="num">{{c2}}</td></tr>
</table>`,
      cells: {
        c1: { answer: 600, points: 3 },
        c2: { answer: 700000, points: 3 }
      },
      explanation: "変動費率＝(3,700,000−2,500,000)÷(5,000−3,000)個＝600円/個。固定費＝3,700,000−5,000×600＝700,000。"
    }
  ];
  qs.forEach(function (q) { window.BOKI.practice.push(q); });
})();
