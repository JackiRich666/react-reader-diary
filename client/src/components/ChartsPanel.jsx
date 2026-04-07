import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function ChartsPanel({ pagesPerDay, booksPerYear }) {
  return (
    <section className="charts-grid">
      <article className="panel chart-panel">
        <div className="panel-header">
          <h2>Страниц в день</h2>
          <p>Последние 7 дней чтения по сессиям.</p>
        </div>
        <div className="chart-frame">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={pagesPerDay}>
              <defs>
                <linearGradient id="pagesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#d56f4a" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#d56f4a" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#dccfb8" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Area type="monotone" dataKey="pages" stroke="#9d4b27" fill="url(#pagesGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="panel chart-panel">
        <div className="panel-header">
          <h2>Книг в год</h2>
          <p>Количество завершенных книг по годам.</p>
        </div>
        <div className="chart-frame">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={booksPerYear}>
              <CartesianGrid strokeDasharray="3 3" stroke="#dccfb8" />
              <XAxis dataKey="year" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="books" fill="#3e6b5a" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>
    </section>
  );
}

