import Card from "@/components/Card";
import { dodgers } from "@/lib/sampleData";

// 6. MLBドジャース速報（架空の試合結果のダミー）
export default function DodgersCard() {
  return (
    <Card title="MLBドジャース速報" icon="⚾">
      <div className="mb-3 flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2">
        <span className="text-sm font-semibold text-blue-800">
          {dodgers.record}
        </span>
        <span className="text-xs text-blue-700">{dodgers.rank}</span>
      </div>
      <ul className="space-y-2">
        {dodgers.games.map((g) => (
          <li key={g.id} className="flex items-center gap-2">
            <span
              className={
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white " +
                (g.result === "勝" ? "bg-emerald-500" : "bg-slate-400")
              }
            >
              {g.result}
            </span>
            <span className="text-slate-700">vs {g.opponent}</span>
            <span className="font-medium text-slate-700">{g.score}</span>
            <span className="ml-auto shrink-0 text-xs text-slate-400">
              {g.date}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
