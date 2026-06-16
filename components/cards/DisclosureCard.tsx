import Card from "@/components/Card";
import { disclosures } from "@/lib/sampleData";

// 5. EDINET / 上場REIT物件取引チェック（架空の開示一覧のダミー）
export default function DisclosureCard() {
  return (
    <Card title="EDINET / REIT物件取引" icon="🏢">
      <ul className="space-y-3">
        {disclosures.map((d) => (
          <li key={d.id}>
            <div className="flex items-center justify-between gap-2">
              <span
                className={
                  "rounded px-1.5 py-0.5 text-xs font-medium " +
                  (d.type === "取得"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-700")
                }
              >
                {d.type}
              </span>
              <span className="shrink-0 text-xs text-slate-400">{d.date}</span>
            </div>
            <p className="mt-1 text-slate-700">{d.property}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {d.reit}・{d.amount}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
