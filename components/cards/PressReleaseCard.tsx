import Card from "@/components/Card";
import { pressReleases } from "@/lib/sampleData";

// 4. 任意企業のプレスリリース更新（架空企業のダミー一覧）
export default function PressReleaseCard() {
  return (
    <Card title="プレスリリース更新" icon="📣">
      <ul className="divide-y divide-slate-100">
        {pressReleases.map((pr) => (
          <li key={pr.id} className="py-2 first:pt-0 last:pb-0">
            <div className="flex items-center justify-between gap-2">
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                {pr.company}
              </span>
              <span className="shrink-0 text-xs text-slate-400">{pr.date}</span>
            </div>
            <p className="mt-1 leading-snug text-slate-700">{pr.title}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
