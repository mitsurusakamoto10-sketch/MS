import Card from "@/components/Card";
import { memos } from "@/lib/sampleData";

// 2. メモ・備忘録
export default function MemoCard() {
  return (
    <Card title="メモ・備忘録" icon="📝">
      <ul className="space-y-3">
        {memos.map((memo) => (
          <li key={memo.id} className="border-l-2 border-slate-200 pl-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-medium text-slate-700">{memo.title}</p>
              <span className="shrink-0 text-xs text-slate-400">
                {memo.updatedAt}
              </span>
            </div>
            <p className="mt-1 text-slate-600">{memo.body}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
