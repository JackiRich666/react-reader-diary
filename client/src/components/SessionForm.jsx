import { useState } from "react";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function SessionForm({ books, onSubmit, busy }) {
  const [formState, setFormState] = useState({
    userBookId: "",
    minutes: 30,
    pagesRead: 20,
    sessionDate: today(),
  });

  const readingBooks = books.filter((book) => book.status !== "completed");

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formState.userBookId) {
      return;
    }

    await onSubmit({
      userBookId: Number(formState.userBookId),
      minutes: Number(formState.minutes),
      pagesRead: Number(formState.pagesRead),
      sessionDate: formState.sessionDate,
    });

    setFormState((prev) => ({
      ...prev,
      minutes: 30,
      pagesRead: 20,
    }));
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Сессия чтения</h2>
        <p>Фиксирует минуты и страницы, а прогресс книги обновляется автоматически.</p>
      </div>

      <form className="panel-form" onSubmit={handleSubmit}>
        <label>
          Книга
          <select
            value={formState.userBookId}
            onChange={(event) => setFormState((prev) => ({ ...prev, userBookId: event.target.value }))}
          >
            <option value="">Выберите книгу</option>
            {readingBooks.map((book) => (
              <option key={book.userBookId} value={book.userBookId}>
                {book.title} - {book.author}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          <label>
            Минуты
            <input
              type="number"
              min="1"
              value={formState.minutes}
              onChange={(event) => setFormState((prev) => ({ ...prev, minutes: event.target.value }))}
            />
          </label>
          <label>
            Страницы
            <input
              type="number"
              min="0"
              value={formState.pagesRead}
              onChange={(event) => setFormState((prev) => ({ ...prev, pagesRead: event.target.value }))}
            />
          </label>
        </div>
        <label>
          Дата
          <input
            type="date"
            value={formState.sessionDate}
            onChange={(event) => setFormState((prev) => ({ ...prev, sessionDate: event.target.value }))}
          />
        </label>

        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? "Сохраняем..." : "Добавить сессию"}
        </button>
      </form>
    </section>
  );
}

