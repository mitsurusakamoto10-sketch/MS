import TodoCard from "@/components/cards/TodoCard";
import MemoCard from "@/components/cards/MemoCard";
import WeatherCard from "@/components/cards/WeatherCard";
import PressReleaseCard from "@/components/cards/PressReleaseCard";
import DisclosureCard from "@/components/cards/DisclosureCard";
import DodgersCard from "@/components/cards/DodgersCard";

// トップページ。6枚のカードをグリッドに並べます。
// 画面幅に応じて 1列（スマホ）→ 2列 → 3列（PC）に自動で変わります。
export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <header className="mb-6">
        <h1 className="text-xl font-bold text-slate-800 sm:text-2xl">
          マイポータル
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          自分用ダッシュボード（初期版・サンプルデータ表示）
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <TodoCard />
        <MemoCard />
        <WeatherCard />
        <PressReleaseCard />
        <DisclosureCard />
        <DodgersCard />
      </div>

      <footer className="mt-8 text-center text-xs text-slate-400">
        表示中の内容はすべてサンプル（架空）データです。
      </footer>
    </main>
  );
}
