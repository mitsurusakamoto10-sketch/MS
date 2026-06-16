import Card from "@/components/Card";
import { weather } from "@/lib/sampleData";

// 3. 天気予報（3日分のダミー）
export default function WeatherCard() {
  return (
    <Card title={`天気予報（${weather.city}）`} icon="⛅">
      <div className="grid grid-cols-3 gap-2 text-center">
        {weather.forecasts.map((f) => (
          <div
            key={f.day}
            className="rounded-lg bg-slate-50 px-2 py-3"
          >
            <p className="text-xs text-slate-500">{f.day}</p>
            <p className="my-1 text-2xl" aria-hidden="true">
              {f.icon}
            </p>
            <p className="text-xs text-slate-600">{f.weather}</p>
            <p className="mt-1 text-xs">
              <span className="text-rose-500">{f.high}°</span>
              <span className="text-slate-400"> / </span>
              <span className="text-sky-500">{f.low}°</span>
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}
