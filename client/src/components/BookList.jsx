import { useEffect, useMemo, useState } from "react";

function statusLabel(status) {
  if (status === "completed") {
    return "Прочитано";
  }
  if (status === "paused") {
    return "Отложено";
  }
  return "Читаю";
}

function BookCard({ book, onUpdate, onPreview, onExport, busy }) {
  const [draft, setDraft] = useState({
    status: book.status,
    currentPage: book.currentPage,
    rating: book.rating || "",
  });

  useEffect(() => {
    setDraft({
      status: book.status,
      currentPage: book.currentPage,
      rating: book.rating || "",
    });
  }, [book]);

  const handleSave = async () => {
    await onUpdate(book.userBookId, {
      status: draft.status,
      currentPage: Number(draft.currentPage),
      rating: draft.rating ? Number(draft.rating) : null,
    });
  };

  return (
    <article className="book-card">
      <div className="book-card-top">
        <div className="book-cover" style={{ background: book.coverColor }}>
          <span>{book.title.slice(0, 1)}</span>
        </div>
        <div className="book-card-meta">
          <span className={`status-badge ${book.status}`}>{statusLabel(book.status)}</span>
          <h3>{book.title}</h3>
          <p>{book.author}</p>
          <small>
            {book.genres.join(", ")} • {book.totalPages} стр.
          </small>
        </div>
      </div>

      <p className="book-description">{book.description}</p>

      <div className="progress-row">
        <div className="progress-track">
          <div className="progress-bar" style={{ width: `${book.progress}%` }} />
        </div>
        <strong>{book.progress}%</strong>
      </div>

      <div className="book-metrics">
        <span>
          {book.currentPage}/{book.totalPages} стр.
        </span>
        <span>{book.sessionCount} сессий</span>
        <span>{book.noteCount} записей</span>
      </div>

      <div className="form-grid compact">
        <label>
          Статус
          <select value={draft.status} onChange={(event) => setDraft((prev) => ({ ...prev, status: event.target.value }))}>
            <option value="reading">Читаю</option>
            <option value="completed">Прочитано</option>
            <option value="paused">Отложено</option>
          </select>
        </label>
        <label>
          Страница
          <input
            type="number"
            min="0"
            max={book.totalPages}
            value={draft.currentPage}
            onChange={(event) => setDraft((prev) => ({ ...prev, currentPage: event.target.value }))}
          />
        </label>
        <label>
          Оценка
          <select value={draft.rating} onChange={(event) => setDraft((prev) => ({ ...prev, rating: event.target.value }))}>
            <option value="">Нет</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
          </select>
        </label>
      </div>

      <div className="card-actions">
        <button className="secondary-button" type="button" onClick={handleSave} disabled={busy}>
          Обновить
        </button>
        <button className="ghost-button" type="button" onClick={() => onPreview(book)}>
          Предпросмотр
        </button>
        <button className="ghost-button" type="button" onClick={() => onExport(book.userBookId, "md")}>
          Export MD
        </button>
        <button className="ghost-button" type="button" onClick={() => onExport(book.userBookId, "json")}>
          Export JSON
        </button>
        <button className="ghost-button" type="button" onClick={() => onExport(book.userBookId, "pdf")}>
          Export PDF
        </button>
      </div>
    </article>
  );
}

export function BookList({ books, onUpdate, onPreview, onExport, busy }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredBooks = useMemo(
    () =>
      books.filter((book) => {
        const matchesStatus = statusFilter === "all" ? true : book.status === statusFilter;
        const haystack = `${book.title} ${book.author} ${book.genres.join(" ")}`.toLowerCase();
        return matchesStatus && haystack.includes(search.toLowerCase());
      }),
    [books, search, statusFilter],
  );

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Моя библиотека</h2>
        <p>Карточки книг, быстрый поиск и ручное обновление статуса или оценки.</p>
      </div>

      <div className="toolbar">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Поиск по названию, автору или жанру"
        />
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">Все статусы</option>
          <option value="reading">Читаю</option>
          <option value="completed">Прочитано</option>
          <option value="paused">Отложено</option>
        </select>
      </div>

      <div className="book-grid">
        {filteredBooks.map((book) => (
          <BookCard
            key={book.userBookId}
            book={book}
            onUpdate={onUpdate}
            onPreview={onPreview}
            onExport={onExport}
            busy={busy}
          />
        ))}
      </div>
    </section>
  );
}
