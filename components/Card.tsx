// すべてのカードで使い回す「枠」のコンポーネント。
// タイトル・アイコン・中身を受け取って、共通の見た目で表示します。

type CardProps = {
  title: string;
  icon: string; // 絵文字
  children: React.ReactNode;
};

export default function Card({ title, icon, children }: CardProps) {
  return (
    <section className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
        <span className="text-lg" aria-hidden="true">
          {icon}
        </span>
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      </header>
      <div className="flex-1 px-4 py-3 text-sm text-slate-600">{children}</div>
    </section>
  );
}
