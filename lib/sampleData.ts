// ============================================================
// サンプルデータ（すべてダミー / 架空の内容）
// ------------------------------------------------------------
// 本物の業務データは入れていません。外部APIも呼び出しません。
// 各カードはこのファイルの値を読み込んで表示します。
// 値を書き換えれば画面の表示も変わります。
// ============================================================

// 1. 今日のToDo
export type Todo = {
  id: number;
  text: string;
  done: boolean;
};

export const todos: Todo[] = [
  { id: 1, text: "メールの返信を確認する", done: true },
  { id: 2, text: "週次レポートの下書き", done: false },
  { id: 3, text: "15:00 打ち合わせの資料準備", done: false },
  { id: 4, text: "経費精算を提出する", done: false },
];

// 2. メモ・備忘録
export type Memo = {
  id: number;
  title: string;
  body: string;
  updatedAt: string;
};

export const memos: Memo[] = [
  {
    id: 1,
    title: "図書館の返却期限",
    body: "今週末まで。延長は1回まで可能。",
    updatedAt: "2026/06/15",
  },
  {
    id: 2,
    title: "アイデアメモ",
    body: "ポータルにダッシュボードのグラフを追加したい。",
    updatedAt: "2026/06/14",
  },
];

// 3. 天気予報
export type Forecast = {
  day: string;
  weather: string;
  icon: string; // 絵文字で簡易表示
  high: number;
  low: number;
};

export const weather = {
  city: "東京",
  forecasts: [
    { day: "今日", weather: "晴れ", icon: "☀️", high: 28, low: 20 },
    { day: "明日", weather: "くもり", icon: "☁️", high: 26, low: 21 },
    { day: "明後日", weather: "雨", icon: "🌧️", high: 23, low: 19 },
  ] as Forecast[],
};

// 4. 任意企業のプレスリリース更新
export type PressRelease = {
  id: number;
  company: string;
  title: string;
  date: string;
};

export const pressReleases: PressRelease[] = [
  {
    id: 1,
    company: "サンプル商事",
    title: "新サービス「サンプルクラウド」提供開始のお知らせ",
    date: "2026/06/16",
  },
  {
    id: 2,
    company: "テスト製作所",
    title: "2026年度 第1四半期 決算説明会の開催について",
    date: "2026/06/15",
  },
  {
    id: 3,
    company: "ダミー工業",
    title: "サステナビリティレポートを公開しました",
    date: "2026/06/13",
  },
];

// 5. EDINET / 上場REIT物件取引チェック
export type Disclosure = {
  id: number;
  reit: string;
  type: string; // 取得 / 譲渡 など
  property: string;
  amount: string;
  date: string;
};

export const disclosures: Disclosure[] = [
  {
    id: 1,
    reit: "サンプル総合リート投資法人",
    type: "取得",
    property: "（仮称）サンプルオフィス東京",
    amount: "12,000百万円",
    date: "2026/06/16",
  },
  {
    id: 2,
    reit: "テスト物流リート投資法人",
    type: "譲渡",
    property: "ダミー物流センター千葉",
    amount: "3,500百万円",
    date: "2026/06/12",
  },
  {
    id: 3,
    reit: "ダミー住宅リート投資法人",
    type: "取得",
    property: "サンプルレジデンス横浜",
    amount: "2,100百万円",
    date: "2026/06/10",
  },
];

// 6. MLBドジャース速報
export type GameResult = {
  id: number;
  date: string;
  opponent: string;
  result: "勝" | "負";
  score: string;
  note: string;
};

export const dodgers = {
  record: "42勝28敗",
  rank: "ナ・リーグ西地区 1位",
  games: [
    {
      id: 1,
      date: "2026/06/15",
      opponent: "サンプルズ",
      result: "勝",
      score: "5 - 3",
      note: "9回に逆転（ダミー）",
    },
    {
      id: 2,
      date: "2026/06/14",
      opponent: "テスターズ",
      result: "負",
      score: "2 - 4",
      note: "投手戦（ダミー）",
    },
    {
      id: 3,
      date: "2026/06/13",
      opponent: "ダミーズ",
      result: "勝",
      score: "7 - 1",
      note: "打線好調（ダミー）",
    },
  ] as GameResult[],
};
