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

// 3. プレスリリース更新（架空企業）
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

// 0. ヘッダー：時間帯に応じたあいさつ + 今日の日付を表示
function renderHeader() {
  const now = new Date();
  const days = ["日", "月", "火", "水", "木", "金", "土"];
  const dateStr =
    now.getFullYear() +
    "年" +
    (now.getMonth() + 1) +
    "月" +
    now.getDate() +
    "日（" +
    days[now.getDay()] +
    "）";
  document.getElementById("today-date").textContent = dateStr;

  const hour = now.getHours();
  let greeting = "こんにちは";
  if (hour >= 5 && hour < 11) greeting = "おはようございます";
  else if (hour >= 11 && hour < 18) greeting = "こんにちは";
  else greeting = "おつかれさまです";
  document.getElementById("greeting").textContent = greeting;
}

// ============================================================
// 実データ（株価・天気）の取得と自動更新
// ・株価   ：/api/stocks（Cloudflare Pages Function 経由でYahooから取得）
// ・天気   ：Open-Meteo から直接取得（無料・キー不要）
// どちらも一定間隔で取り直し、常に最新を表示します。
// ============================================================

// ---- 株価バー ----------------------------------------------
async function loadStocks() {
  const el = document.getElementById("stock-ticker");
  if (!el) return;
  try {
    const res = await fetch("/api/stocks", { cache: "no-store" });
    if (!res.ok) throw new Error("status " + res.status);
    const data = await res.json();
    el.innerHTML = data.items.map(renderTickerItem).join("");
  } catch (e) {
    el.innerHTML =
      '<div class="strip-loading">株価を取得できませんでした（次回更新で再取得します）</div>';
  }
}

function renderTickerItem(it) {
  // 取得失敗時は「—」を表示
  if (!it.ok || it.price == null) {
    return (
      '<div class="ticker-item"><div class="ticker-name">' +
      esc(it.name) +
      '</div><div class="ticker-price">—</div></div>'
    );
  }
  const price = Number(it.price).toLocaleString("ja-JP", {
    maximumFractionDigits: 2,
  });
  let cls = "flat";
  let arrow = "→";
  let sign = "";
  if (it.change > 0) {
    cls = "up";
    arrow = "▲";
    sign = "+";
  } else if (it.change < 0) {
    cls = "down";
    arrow = "▼";
  }
  const chg =
    it.change != null
      ? sign +
        Number(it.change).toLocaleString("ja-JP", { maximumFractionDigits: 2 })
      : "";
  const pct =
    it.changePct != null ? " (" + sign + it.changePct.toFixed(2) + "%)" : "";
  return (
    '<div class="ticker-item">' +
    '<div class="ticker-name">' +
    esc(it.name) +
    "</div>" +
    '<div class="ticker-price">' +
    price +
    "</div>" +
    '<div class="ticker-change ' +
    cls +
    '">' +
    arrow +
    " " +
    chg +
    pct +
    "</div>" +
    "</div>"
  );
}

// ---- 今日の東京の天気（1時間ごと） -------------------------
// WMO天気コード → 絵文字（おおまかな対応）
function weatherEmoji(code) {
  if (code === 0) return "☀️";
  if (code === 1) return "🌤️";
  if (code === 2) return "⛅";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if (code >= 51 && code <= 57) return "🌦️";
  if (code >= 61 && code <= 67) return "🌧️";
  if (code >= 71 && code <= 77) return "❄️";
  if (code >= 80 && code <= 82) return "🌦️";
  if (code === 85 || code === 86) return "🌨️";
  if (code >= 95) return "⛈️";
  return "☁️";
}

async function loadWeather() {
  const hourlyEl = document.getElementById("hourly-weather");
  const weeklyEl = document.getElementById("weekly-weather");
  if (!hourlyEl || !weeklyEl) return;
  try {
    const url =
      "https://api.open-meteo.com/v1/forecast" +
      "?latitude=35.6895&longitude=139.6917" +
      "&hourly=temperature_2m,precipitation_probability,weather_code" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min" +
      "&timezone=Asia%2FTokyo&forecast_days=7";
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("status " + res.status);
    const data = await res.json();

    renderHourly(hourlyEl, data.hourly);
    renderWeekly(weeklyEl, data.daily);

    const updated = document.getElementById("weather-updated");
    if (updated) {
      updated.textContent =
        "更新 " +
        new Date().toLocaleTimeString("ja-JP", {
          hour: "2-digit",
          minute: "2-digit",
        });
    }
  } catch (e) {
    hourlyEl.innerHTML =
      '<div class="strip-loading">天気を取得できませんでした（次回更新で再取得します）</div>';
    weeklyEl.innerHTML = "";
  }
}

// 現在時刻から12時間先までを表示
function renderHourly(el, h) {
  const now = new Date();
  const threshold = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours()
  );
  // 現在の時刻以降の最初の位置を探す
  let start = h.time.findIndex((t) => new Date(t) >= threshold);
  if (start < 0) start = 0;
  const end = Math.min(start + 12, h.time.length);

  let html = "";
  for (let i = start; i < end; i++) {
    const hour = new Date(h.time[i]).getHours();
    const temp = Math.round(h.temperature_2m[i]);
    const pop = h.precipitation_probability
      ? h.precipitation_probability[i]
      : null;
    const isNow = i === start ? " now" : "";
    html +=
      '<div class="hour-cell' +
      isNow +
      '">' +
      '<div class="hour-time">' +
      hour +
      "時</div>" +
      '<div class="hour-emoji">' +
      weatherEmoji(h.weather_code[i]) +
      "</div>" +
      '<div class="hour-temp">' +
      temp +
      "°</div>" +
      '<div class="hour-pop">' +
      (pop != null ? pop + "%" : "") +
      "</div>" +
      "</div>";
  }
  el.innerHTML = html;
  el.scrollLeft = 0;
}

// 明日以降の週間天気を表示
function renderWeekly(el, d) {
  const days = ["日", "月", "火", "水", "木", "金", "土"];
  let html = "";
  for (let i = 1; i < d.time.length; i++) {
    // i=1 で明日から
    const date = new Date(d.time[i] + "T00:00:00");
    const label =
      date.getMonth() + 1 + "/" + date.getDate() + "（" + days[date.getDay()] + "）";
    html +=
      '<div class="weekly-row">' +
      '<span class="weekly-day">' +
      label +
      "</span>" +
      '<span class="weekly-emoji">' +
      weatherEmoji(d.weather_code[i]) +
      "</span>" +
      '<span class="weekly-temp"><span class="high">' +
      Math.round(d.temperature_2m_max[i]) +
      '°</span><span class="sep"> / </span><span class="low">' +
      Math.round(d.temperature_2m_min[i]) +
      "°</span></span>" +
      "</div>";
  }
  el.innerHTML = html;
}

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

// 3. プレスリリース
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
  renderHeader();

  // 実データ：初回取得 + 定期更新（株価60秒 / 天気10分）
  loadStocks();
  setInterval(loadStocks, 60 * 1000);
  loadWeather();
  setInterval(loadWeather, 10 * 60 * 1000);

  renderTodos();
  renderMemos();
  renderPress();
  renderDisclosures();
  renderDodgers();
});
