/* 簿記2級演習アプリ データレジストリ
 * 各データファイル（mock*.js / practice_*.js）はこのファイルの後に読み込み、
 * window.BOKI.mocks / window.BOKI.practice に push する。
 */
window.BOKI = {
  mocks: [],
  practice: [],
  topics: {
    /* 商業簿記 */
    cash_bank:      { label: "現金預金・銀行勘定調整", cat: "商業簿記" },
    tegata_saiken:  { label: "手形・債権債務",         cat: "商業簿記" },
    securities:     { label: "有価証券",               cat: "商業簿記" },
    fixed_assets:   { label: "固定資産",               cat: "商業簿記" },
    hikiate:        { label: "引当金",                 cat: "商業簿記" },
    zeikin:         { label: "税金・税効果",           cat: "商業簿記" },
    junshisan:      { label: "純資産・株式",           cat: "商業簿記" },
    gaika:          { label: "外貨建取引",             cat: "商業簿記" },
    lease:          { label: "リース取引",             cat: "商業簿記" },
    shohin:         { label: "商品売買・サービス業",   cat: "商業簿記" },
    kessan:         { label: "決算整理・財務諸表",     cat: "商業簿記" },
    renketsu:       { label: "連結会計",               cat: "商業簿記" },
    kabunushi:      { label: "株主資本等変動計算書",   cat: "商業簿記" },
    honshiten:      { label: "本支店会計",             cat: "商業簿記" },
    /* 工業簿記 */
    kogyo_shiwake:  { label: "工業簿記の仕訳",         cat: "工業簿記" },
    himoku:         { label: "費目別計算",             cat: "工業簿記" },
    bumon:          { label: "部門別計算",             cat: "工業簿記" },
    kobetsu:        { label: "個別原価計算",           cat: "工業簿記" },
    sogo:           { label: "総合原価計算",           cat: "工業簿記" },
    hyojun:         { label: "標準原価計算",           cat: "工業簿記" },
    cvp:            { label: "直接原価計算・CVP",      cat: "工業簿記" }
  }
};
