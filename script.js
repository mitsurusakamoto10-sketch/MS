// ============================================================
// マイポータル スクリプト
// ------------------------------------------------------------
// すべてサンプル（架空）データです。社内・個人・機密情報は
// 含めていません。外部APIも呼び出しません。
// このファイルの値を書き換えると、画面の表示も変わります。
// ============================================================

// ---- 表示を組み立てる関数 ----------------------------------

// 0. 最上部バーの時計：本日の日付 + 現在時刻を毎秒更新
function startClock() {
  const dateEl = document.getElementById("today-date");
  const timeEl = document.getElementById("clock-time");
  const days = ["日", "月", "火", "水", "木", "金", "土"];

  function tick() {
    const now = new Date();
    if (dateEl) {
      dateEl.textContent =
        now.getFullYear() +
        "/" +
        (now.getMonth() + 1) +
        "/" +
        now.getDate() +
        "（" +
        days[now.getDay()] +
        "）";
    }
    if (timeEl) {
      timeEl.textContent = now.toLocaleTimeString("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    }
  }
  tick();
  setInterval(tick, 1000);
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

// ---- 天気予報（簡易表示 + 都道府県の切替） -----------------
// WMO天気コード → 絵文字
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

// WMO天気コード → 日本語の天気名
function weatherText(code) {
  if (code === 0) return "快晴";
  if (code === 1) return "晴れ";
  if (code === 2) return "晴れ時々くもり";
  if (code === 3) return "くもり";
  if (code === 45 || code === 48) return "霧";
  if (code >= 51 && code <= 57) return "霧雨";
  if (code >= 61 && code <= 67) return "雨";
  if (code >= 71 && code <= 77) return "雪";
  if (code >= 80 && code <= 82) return "にわか雨";
  if (code === 85 || code === 86) return "にわか雪";
  if (code >= 95) return "雷雨";
  return "くもり";
}

// 都道府県（各県庁所在地の座標）
const PREFECTURES = [
  { name: "北海道", lat: 43.0642, lon: 141.3469 },
  { name: "青森県", lat: 40.8244, lon: 140.74 },
  { name: "岩手県", lat: 39.7036, lon: 141.1527 },
  { name: "宮城県", lat: 38.2688, lon: 140.8721 },
  { name: "秋田県", lat: 39.7186, lon: 140.1024 },
  { name: "山形県", lat: 38.2404, lon: 140.3633 },
  { name: "福島県", lat: 37.75, lon: 140.4678 },
  { name: "茨城県", lat: 36.3418, lon: 140.4468 },
  { name: "栃木県", lat: 36.5658, lon: 139.8836 },
  { name: "群馬県", lat: 36.3912, lon: 139.0608 },
  { name: "埼玉県", lat: 35.8569, lon: 139.6489 },
  { name: "千葉県", lat: 35.6047, lon: 140.1233 },
  { name: "東京都", lat: 35.6895, lon: 139.6917 },
  { name: "神奈川県", lat: 35.4478, lon: 139.6425 },
  { name: "新潟県", lat: 37.9026, lon: 139.0236 },
  { name: "富山県", lat: 36.6953, lon: 137.2113 },
  { name: "石川県", lat: 36.5947, lon: 136.6256 },
  { name: "福井県", lat: 36.0652, lon: 136.2216 },
  { name: "山梨県", lat: 35.6642, lon: 138.5684 },
  { name: "長野県", lat: 36.6513, lon: 138.181 },
  { name: "岐阜県", lat: 35.3912, lon: 136.7223 },
  { name: "静岡県", lat: 34.9769, lon: 138.3831 },
  { name: "愛知県", lat: 35.1802, lon: 136.9066 },
  { name: "三重県", lat: 34.7303, lon: 136.5086 },
  { name: "滋賀県", lat: 35.0045, lon: 135.8686 },
  { name: "京都府", lat: 35.0211, lon: 135.7556 },
  { name: "大阪府", lat: 34.6863, lon: 135.52 },
  { name: "兵庫県", lat: 34.6913, lon: 135.183 },
  { name: "奈良県", lat: 34.6851, lon: 135.8048 },
  { name: "和歌山県", lat: 34.2261, lon: 135.1675 },
  { name: "鳥取県", lat: 35.5036, lon: 134.2383 },
  { name: "島根県", lat: 35.4723, lon: 133.0505 },
  { name: "岡山県", lat: 34.6618, lon: 133.9344 },
  { name: "広島県", lat: 34.3966, lon: 132.4596 },
  { name: "山口県", lat: 34.1859, lon: 131.4714 },
  { name: "徳島県", lat: 34.0658, lon: 134.5593 },
  { name: "香川県", lat: 34.3401, lon: 134.0434 },
  { name: "愛媛県", lat: 33.8416, lon: 132.7657 },
  { name: "高知県", lat: 33.5597, lon: 133.5311 },
  { name: "福岡県", lat: 33.6064, lon: 130.4181 },
  { name: "佐賀県", lat: 33.2494, lon: 130.2988 },
  { name: "長崎県", lat: 32.7448, lon: 129.8737 },
  { name: "熊本県", lat: 32.7898, lon: 130.7417 },
  { name: "大分県", lat: 33.2382, lon: 131.6126 },
  { name: "宮崎県", lat: 31.9111, lon: 131.4239 },
  { name: "鹿児島県", lat: 31.5602, lon: 130.5581 },
  { name: "沖縄県", lat: 26.2124, lon: 127.6809 },
];
const PREF_KEY = "myportal_pref";

// 現在選択中の都道府県（保存値 → 無ければ東京都）
function currentPref() {
  let saved = null;
  try {
    saved = localStorage.getItem(PREF_KEY);
  } catch (e) {
    /* 取得できなくても既定値を使う */
  }
  return (
    PREFECTURES.find((p) => p.name === saved) ||
    PREFECTURES.find((p) => p.name === "東京都") ||
    PREFECTURES[0]
  );
}

// 都道府県セレクト（ダイヤル）の初期化
function initPrefSelect() {
  const sel = document.getElementById("pref-select");
  if (!sel) return;
  const cur = currentPref();
  sel.innerHTML = PREFECTURES.map(
    (p) =>
      '<option value="' +
      p.name +
      '"' +
      (p.name === cur.name ? " selected" : "") +
      ">" +
      p.name +
      "</option>"
  ).join("");
  sel.addEventListener("change", () => {
    try {
      localStorage.setItem(PREF_KEY, sel.value);
    } catch (e) {
      /* 保存できなくても表示は継続 */
    }
    loadWeather();
  });
}

async function loadWeather() {
  const el = document.getElementById("weather-now");
  if (!el) return;
  const pref = currentPref();
  try {
    const url =
      "https://api.open-meteo.com/v1/forecast" +
      "?latitude=" +
      pref.lat +
      "&longitude=" +
      pref.lon +
      "&current=temperature_2m,weather_code,precipitation" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
      "&timezone=Asia%2FTokyo&forecast_days=3";
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("status " + res.status);
    const data = await res.json();
    renderWeather(el, data, pref);

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
    el.innerHTML =
      '<div class="strip-loading">天気を取得できませんでした（次回更新で再取得します）</div>';
  }
}

// 簡易表示：現在の天気 + 今日/明日/明後日のミニ予報
function renderWeather(el, data, pref) {
  const c = data.current || {};
  const d = data.daily || {};
  const code = c.weather_code;
  const pop =
    d.precipitation_probability_max && d.precipitation_probability_max[0] != null
      ? d.precipitation_probability_max[0]
      : 0;

  const labels = ["今日", "明日", "明後日"];
  let mini = "";
  for (let i = 0; i < 3 && d.time && i < d.time.length; i++) {
    mini +=
      '<div class="wx-mini-day">' +
      '<span class="wx-mini-label">' +
      labels[i] +
      "</span>" +
      '<span class="wx-mini-emoji">' +
      weatherEmoji(d.weather_code[i]) +
      "</span>" +
      '<span class="wx-mini-temp"><b>' +
      Math.round(d.temperature_2m_max[i]) +
      "°</b>/" +
      Math.round(d.temperature_2m_min[i]) +
      "°</span>" +
      "</div>";
  }

  el.innerHTML =
    '<div class="wx-current">' +
    '<span class="wx-cur-emoji">' +
    weatherEmoji(code) +
    "</span>" +
    '<div class="wx-cur-main">' +
    '<div class="wx-cur-temp">' +
    Math.round(c.temperature_2m) +
    "°</div>" +
    '<div class="wx-cur-cond">' +
    weatherText(code) +
    " ・ 降水 " +
    pop +
    "%</div>" +
    "</div>" +
    "</div>" +
    '<div class="wx-mini">' +
    mini +
    "</div>";
}

// ---- 公開ページのサムネイル一覧（NFM / NewsPicks） ----------
async function loadThumbs(src, elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  try {
    const res = await fetch("/api/feed?src=" + src, { cache: "no-store" });
    if (!res.ok) throw new Error("status " + res.status);
    const data = await res.json();
    if (!data.items || data.items.length === 0) {
      el.innerHTML =
        '<div class="strip-loading">情報を取得できませんでした（公開ページから取得不可）。</div>';
      return;
    }
    el.innerHTML = data.items.map(feedRow).join("");
  } catch (e) {
    el.innerHTML =
      '<div class="strip-loading">情報を取得できませんでした（あとで再取得します）。</div>';
  }
}

// 1行＝1記事（表題のみ・記事URLにリンク）
function feedRow(it) {
  return (
    '<a class="feed-row" href="' +
    escAttr(it.link) +
    '" target="_blank" rel="noopener">' +
    esc(it.title) +
    "</a>"
  );
}

// HTMLに使う文字をエスケープ（記号がそのまま表示されるようにする）
function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// 属性値（href等）用のエスケープ
function escAttr(str) {
  return esc(str).replace(/"/g, "&quot;");
}

// 上場REIT開示（EDINET・直近10日・題名のみ）
async function loadREIT() {
  const el = document.getElementById("disclosure-card");
  if (!el) return;
  try {
    const res = await fetch("/api/reit", { cache: "no-store" });
    if (!res.ok) throw new Error("status " + res.status);
    const data = await res.json();
    if (data.error === "no_api_key") {
      el.innerHTML =
        '<div class="strip-loading">EDINET APIキーが未設定です（Cloudflareの環境変数 EDINET_API_KEY を設定してください）。</div>';
      return;
    }
    if (!data.items || data.items.length === 0) {
      el.innerHTML =
        '<div class="strip-loading">直近10日の開示はありませんでした。</div>';
      return;
    }
    el.innerHTML =
      '<div class="feed-list">' + data.items.map(reitRow).join("") + "</div>";
  } catch (e) {
    el.innerHTML =
      '<div class="strip-loading">開示情報を取得できませんでした（あとで再取得します）。</div>';
  }
}

function reitRow(it) {
  return (
    '<a class="reit-row" href="' +
    escAttr(it.link) +
    '" target="_blank" rel="noopener">' +
    '<span class="reit-date">' +
    esc(it.date) +
    "</span>" +
    '<span class="reit-title">' +
    esc(it.title) +
    "</span>" +
    "</a>"
  );
}

// MLBドジャース（実データ：成績・結果・予定／横一行で表示）
async function loadMLB() {
  const track = document.getElementById("mlb-track");
  if (!track) return;
  try {
    const res = await fetch("/api/mlb", { cache: "no-store" });
    if (!res.ok) throw new Error("status " + res.status);
    const data = await res.json();
    renderMLB(data);
  } catch (e) {
    track.innerHTML =
      '<div class="strip-loading">成績を取得できませんでした（あとで再取得します）。</div>';
  }
}

function renderMLB(data) {
  const track = document.getElementById("mlb-track");
  const sumEl = document.getElementById("mlb-summary");
  const games = data.games || [];

  const now = new Date();
  const todayMD = now.getMonth() + 1 + "/" + now.getDate();

  // サマリー（成績）＋本日の試合結果
  let summary = data.record || "—";
  if (data.rank) summary += " ・ " + data.rank;
  if (data.streak) summary += " ・ " + data.streak;
  const todayGame = games.find((g) => g.date === todayMD);
  if (todayGame) {
    const vs = (todayGame.isHome ? "vs " : "＠") + todayGame.opponent;
    let tg = "本日 " + vs;
    if (todayGame.status === "勝" || todayGame.status === "負") {
      tg += " " + todayGame.status + " " + todayGame.score;
    } else if (todayGame.status === "試合中") {
      tg += " 試合中 " + todayGame.score;
    } else {
      tg += " 予定";
    }
    summary += " ｜ " + tg;
  } else {
    summary += " ｜ 本日の試合はありません";
  }
  if (sumEl) sumEl.textContent = summary;

  if (!games.length) {
    track.innerHTML = '<div class="strip-loading">試合情報がありません。</div>';
    return;
  }

  track.innerHTML = games.map((g) => mlbCell(g, todayMD)).join("");

  // 本日のコマが見える位置へスクロール
  const todayCell = track.querySelector(".mlb-cell.today");
  if (todayCell) track.scrollLeft = Math.max(0, todayCell.offsetLeft - 12);
}

function mlbCell(g, todayMD) {
  let badgeClass = "result-upcoming";
  if (g.status === "勝") badgeClass = "result-win";
  else if (g.status === "負") badgeClass = "result-lose";
  else if (g.status === "試合中") badgeClass = "result-live";

  const opp = (g.isHome ? "vs " : "＠") + esc(g.opponent);
  const today = g.date === todayMD ? " today" : "";
  const score = g.score ? '<div class="mlb-cell-score">' + esc(g.score) + "</div>" : "";

  return (
    '<a class="mlb-cell' +
    today +
    '" href="' +
    escAttr(g.link) +
    '" target="_blank" rel="noopener">' +
    '<div class="mlb-cell-date">' +
    esc(g.date) +
    "</div>" +
    '<div class="mlb-cell-opp">' +
    opp +
    "</div>" +
    '<div class="mlb-cell-badge ' +
    badgeClass +
    '">' +
    esc(g.status) +
    "</div>" +
    score +
    "</a>"
  );
}

// ---- 画面読み込み後にすべて表示 ----------------------------
document.addEventListener("DOMContentLoaded", () => {
  startClock();

  // 実データ：初回取得 + 定期更新（株価60秒 / 天気10分 / ニュース30分）
  loadStocks();
  setInterval(loadStocks, 60 * 1000);
  initPrefSelect();
  loadWeather();
  setInterval(loadWeather, 10 * 60 * 1000);
  loadMLB();
  setInterval(loadMLB, 5 * 60 * 1000);
  loadThumbs("nfm", "nfm-grid");
  loadThumbs("newspicks", "picks-grid");
  setInterval(() => {
    loadThumbs("nfm", "nfm-grid");
    loadThumbs("newspicks", "picks-grid");
  }, 30 * 60 * 1000);

  // 上場REIT開示(EDINET)：初回取得 + 毎朝8時に更新
  loadREIT();
  scheduleDailyAt8(loadREIT);
});

// 毎朝8時(ローカル時刻)に関数を実行する
function scheduleDailyAt8(fn) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(8, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  setTimeout(() => {
    fn();
    setInterval(fn, 24 * 60 * 60 * 1000);
  }, next - now);
}
