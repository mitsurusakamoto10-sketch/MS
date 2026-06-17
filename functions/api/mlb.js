// ============================================================
// MLBドジャース 取得 Function
// ------------------------------------------------------------
// MLB公式の無料データAPI(statsapi.mlb.com・キー不要)から
// 成績(順位)・直近の試合結果・今後の予定を取得して返します。
//
// 呼び出し: GET /api/mlb
// ============================================================

const TEAM_ID = 119; // Los Angeles Dodgers
const NL_LEAGUE_ID = 104; // ナショナルリーグ

function pad(n) {
  return n < 10 ? "0" + n : "" + n;
}
function ymd(d) {
  return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
}

export async function onRequest() {
  const now = new Date();
  const season = now.getUTCFullYear();
  const start = new Date(now.getTime() - 10 * 86400000);
  const end = new Date(now.getTime() + 10 * 86400000);

  const schedUrl =
    "https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=" +
    TEAM_ID +
    "&startDate=" +
    ymd(start) +
    "&endDate=" +
    ymd(end) +
    "&hydrate=team,linescore";
  const standUrl =
    "https://statsapi.mlb.com/api/v1/standings?leagueId=" +
    NL_LEAGUE_ID +
    "&season=" +
    season +
    "&standingsTypes=regularSeason";

  try {
    const [schedRes, standRes] = await Promise.all([
      fetch(schedUrl, { headers: { Accept: "application/json" } }),
      fetch(standUrl, { headers: { Accept: "application/json" } }),
    ]);
    const sched = await schedRes.json();
    const stand = standRes.ok ? await standRes.json() : { records: [] };

    // 成績（順位）
    let record = "";
    let rank = "";
    let streak = "";
    for (const rec of stand.records || []) {
      for (const tr of rec.teamRecords || []) {
        if (tr.team && tr.team.id === TEAM_ID) {
          record = tr.wins + "勝" + tr.losses + "敗";
          rank = "ナ・リーグ西地区 " + tr.divisionRank + "位";
          if (tr.streak && tr.streak.streakCode) streak = tr.streak.streakCode;
        }
      }
    }

    // 試合（結果 + 予定）
    const games = [];
    for (const date of sched.dates || []) {
      for (const g of date.games || []) {
        const home = g.teams.home;
        const away = g.teams.away;
        const isHome = home.team.id === TEAM_ID;
        const me = isHome ? home : away;
        const opp = isHome ? away : home;
        const state = g.status.abstractGameState; // Final / Live / Preview

        // 日本時間の日付（Yahooの日別ページ用）
        const jst = new Date(Date.parse(g.gameDate) + 9 * 3600000);
        const dateStr = jst.getUTCMonth() + 1 + "/" + jst.getUTCDate();
        const link =
          "https://baseball.yahoo.co.jp/mlb/schedule/?date=" + ymd(jst);

        let status = "予定";
        let score = "";
        if (state === "Final") {
          status = me.isWinner ? "勝" : "負";
          score = (me.score != null ? me.score : 0) + " - " + (opp.score != null ? opp.score : 0);
        } else if (state === "Live") {
          status = "試合中";
          score = (me.score != null ? me.score : 0) + " - " + (opp.score != null ? opp.score : 0);
        }

        games.push({
          date: dateStr,
          opponent: opp.team.name,
          isHome,
          status,
          score,
          state,
          link,
          ts: Date.parse(g.gameDate),
        });
      }
    }
    games.sort((a, b) => a.ts - b.ts);

    return new Response(
      JSON.stringify({ updatedAt: new Date().toISOString(), record, rank, streak, games }),
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=120",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ updatedAt: new Date().toISOString(), games: [], error: String(e) }),
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
