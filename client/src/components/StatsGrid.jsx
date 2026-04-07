export function StatsGrid({ summary }) {
  const cards = [
    { label: "Всего книг", value: summary.totalBooks },
    { label: "Читаю сейчас", value: summary.readingBooks },
    { label: "Прочитано", value: summary.completedBooks },
    { label: "Отложено", value: summary.pausedBooks },
    { label: "Страниц пройдено", value: summary.totalPagesRead },
    { label: "Минут чтения", value: summary.totalMinutes },
    { label: "Заметок и цитат", value: summary.totalEntries },
  ];

  return (
    <section className="stats-grid">
      {cards.map((card) => (
        <article key={card.label} className="stats-card">
          <span>{card.label}</span>
          <strong>{card.value}</strong>
        </article>
      ))}
    </section>
  );
}

