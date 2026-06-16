import Card from "@/components/Card";
import { todos } from "@/lib/sampleData";

// 1. 今日のToDo（チェックリスト風の表示。サンプルデータの done で見た目を切り替え）
export default function TodoCard() {
  return (
    <Card title="今日のToDo" icon="✅">
      <ul className="space-y-2">
        {todos.map((todo) => (
          <li key={todo.id} className="flex items-center gap-2">
            <span
              className={
                "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] " +
                (todo.done
                  ? "border-slate-400 bg-slate-700 text-white"
                  : "border-slate-300 bg-white text-transparent")
              }
              aria-hidden="true"
            >
              ✓
            </span>
            <span className={todo.done ? "text-slate-400 line-through" : ""}>
              {todo.text}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
