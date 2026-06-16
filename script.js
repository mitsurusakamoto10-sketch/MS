// ============================================================
// マイポータル スクリプト
// ------------------------------------------------------------
// すべてサンプル（架空）データです。社内・個人・機密情報は
// 含めていません。外部APIも呼び出しません。
// このファイルの値を書き換えると、画面の表示も変わります。
// ============================================================

// ---- サンプルデータ ----------------------------------------

// 1. 今日のToDo
const todos = [
  { id: 1, text: "メールの返信を確認する", done: true },
  { id: 2, text: "週次レポートの下書き", done: false },
  { id: 3, text: "15:00 打ち合わせの資料準備", done: false },
  { id: 4, text: "経費精算を提出する", done: false },
];

// 2. メモ・備忘録
const memos = [
  { title: "図書館の返却期限", body: "今週末まで。延長は1回まで可能。", date: "2026/06/15" },
  { title: "アイデアメモ", body: "ダッシュボードにグラフを追加したい。", date: "2026/06/14" },
];

// 3. 天気予報
const weather = {
  city: "東京",
  forecasts: [
    { day: "今日", weather: "晴れ", icon: "☀️", high: 28, low: 20 },
    { day: "明日", weather: "くもり", icon: "☁️", high: 26, low: 21 },
    { day: "明後日", weather: "雨", icon: "🌧️", high: 23, low: 19 },
  ],
};

// 4. プレスリリース更新（架空企業）
const pressReleases = [
  { company: "サンプル商事", title: "新サービス「サンプルクラウド」提供開始のお知らせ", date: "2026/06/16" },
  { company: "テスト製作所", title: "2026年度 第1四半期 決算説明会の開催について", date: "2026/06/15" },
  { company: "ダミー工業", title: "サステナビリティレポートを公開しました", date: "2026/06/13" },
];

// 5. EDINET / 上場REIT物件取引（架空の開示）
const disclosures = [
  { reit: "サンプル総合リート投資法人", type: "取得", property: "（仮称）サンプルオフィス東京", amount: "12,000百万円", date: "2026/06/16" },
  { reit: "テスト物流リート投資法人", type: "譲渡", property: "ダミー物流センター千葉", amount: "3,500百万円", date: "2026/06/12" },
  { reit: "ダミー住宅リート投資法人", type: "取得", property: "サンプルレジデンス横浜", amount: "2,100百万円", date: "2026/06/10" },
];

// 6. MLBドジャース速報（架空の試合結果）
const dodgers = {
  record: "42勝28敗",
  rank: "ナ・リーグ西地区 1位",
  games: [
    { date: "2026/06/15", opponent: "サンプルズ", result: "勝", score: "5 - 3" },
    { date: "2026/06/14", opponent: "テスターズ", result: "負", score: "2 - 4" },
    { date: "2026/06/13", opponent: "ダミーズ", result: "勝", score: "7 - 1" },
  ],
};

// ---- 表示を組み立てる関数 ----------------------------------

// HTMLに使う文字をエスケープ（記号がそのまま表示されるようにする）
function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// 1. ToDo（クリックで完了の切替ができます）
function renderTodos() {
  const el = document.getElementById("todo-card");
  const ul = document.createElement("ul");
  ul.className = "todo-list";

  todos.forEach((todo) => {
    const li = document.createElement("li");
    li.className = "todo-item" + (todo.done ? " done" : "");
    li.innerHTML =
      '<span class="todo-box">✓</span>' +
      '<span class="todo-text">' + esc(todo.text) + "</span>";
    // クリックで done を反転させ、見た目を更新
    li.addEventListener("click", () => {
      todo.done = !todo.done;
      li.classList.toggle("done");
    });
    ul.appendChild(li);
  });

  el.appendChild(ul);
}

// 2. メモ
function renderMemos() {
  const el = document.getElementById("memo-card");
  el.innerHTML =
    '<ul class="memo-list">' +
    memos
      .map(
        (m) =>
          '<li class="memo-item">' +
          '<div class="memo-top"><span class="memo-title">' +
          esc(m.title) +
          '</span><span class="memo-date">' +
          esc(m.date) +
          "</span></div>" +
          "<div>" +
          esc(m.body) +
          "</div></li>"
      )
      .join("") +
    "</ul>";
}

// 3. 天気
function renderWeather() {
  document.getElementById("weather-title").textContent =
    "天気予報（" + weather.city + "）";
  const el = document.getElementById("weather-card");
  el.innerHTML =
    '<div class="weather-grid">' +
    weather.forecasts
      .map(
        (f) =>
          '<div class="weather-day">' +
          '<div class="label">' + esc(f.day) + "</div>" +
          '<div class="emoji">' + f.icon + "</div>" +
          "<div>" + esc(f.weather) + "</div>" +
          '<div class="temp"><span class="high">' + f.high +
          '°</span><span class="sep"> / </span><span class="low">' + f.low +
          "°</span></div>" +
          "</div>"
      )
      .join("") +
    "</div>";
}

// 4. プレスリリース
function renderPress() {
  const el = document.getElementById("press-card");
  el.innerHTML =
    '<ul class="list-divided">' +
    pressReleases
      .map(
        (p) =>
          "<li>" +
          '<div class="row-top"><span class="tag">' +
          esc(p.company) +
          '</span><span class="date">' +
          esc(p.date) +
          "</span></div>" +
          '<div class="title-line">' +
          esc(p.title) +
          "</div></li>"
      )
      .join("") +
    "</ul>";
}

// 5. 開示（REIT）
function renderDisclosures() {
  const el = document.getElementById("disclosure-card");
  el.innerHTML =
    '<ul class="disclosure-list">' +
    disclosures
      .map((d) => {
        const tagClass = d.type === "取得" ? "tag-acquire" : "tag-transfer";
        return (
          "<li>" +
          '<div class="row-top"><span class="tag ' + tagClass + '">' +
          esc(d.type) +
          '</span><span class="date">' +
          esc(d.date) +
          "</span></div>" +
          '<div class="title-line">' +
          esc(d.property) +
          "</div>" +
          '<div class="sub-line">' +
          esc(d.reit) + "・" + esc(d.amount) +
          "</div></li>"
        );
      })
      .join("") +
    "</ul>";
}

// 6. ドジャース
function renderDodgers() {
  const el = document.getElementById("dodgers-card");
  el.innerHTML =
    '<div class="dodgers-summary">' +
    '<span class="dodgers-record">' + esc(dodgers.record) + "</span>" +
    '<span class="dodgers-rank">' + esc(dodgers.rank) + "</span></div>" +
    '<ul class="game-list">' +
    dodgers.games
      .map((g) => {
        const badgeClass = g.result === "勝" ? "result-win" : "result-lose";
        return (
          '<li class="game-item">' +
          '<span class="result-badge ' + badgeClass + '">' +
          esc(g.result) +
          "</span>" +
          "<span>vs " + esc(g.opponent) + "</span>" +
          '<span class="game-score">' + esc(g.score) + "</span>" +
          '<span class="game-date">' + esc(g.date) + "</span>" +
          "</li>"
        );
      })
      .join("") +
    "</ul>";
}

// ---- 画面読み込み後にすべて表示 ----------------------------
document.addEventListener("DOMContentLoaded", () => {
  renderTodos();
  renderMemos();
  renderWeather();
  renderPress();
  renderDisclosures();
  renderDodgers();
});
