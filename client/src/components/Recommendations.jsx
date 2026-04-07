export function Recommendations({ items }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Рекомендации</h2>
        <p>Подборка на основе завершенных книг, оценок и любимых жанров.</p>
      </div>

      <div className="recommendation-list">
        {items.map((item) => (
          <article key={item.id} className="recommendation-card">
            <span className="book-cover-dot" style={{ background: item.coverColor }} />
            <div>
              <h3>{item.title}</h3>
              <p>{item.author}</p>
              <small>
                {item.genres.join(", ")} • {item.totalPages} стр. • {item.publishedYear}
              </small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
