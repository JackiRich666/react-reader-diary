import { useState } from "react";

export function EntryForm({ books, onSubmit, busy }) {
  const [formState, setFormState] = useState({
    userBookId: "",
    type: "note",
    pageNumber: "",
    content: "",
  });

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formState.userBookId || !formState.content.trim()) {
      return;
    }

    await onSubmit({
      userBookId: Number(formState.userBookId),
      type: formState.type,
      pageNumber: formState.pageNumber ? Number(formState.pageNumber) : null,
      content: formState.content.trim(),
    });

    setFormState((prev) => ({
      ...prev,
      pageNumber: "",
      content: "",
    }));
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Заметка или цитата</h2>
        <p>Записи сохраняются отдельно по каждой книге и доступны для экспорта.</p>
      </div>

      <form className="panel-form" onSubmit={handleSubmit}>
        <label>
          Книга
          <select
            value={formState.userBookId}
            onChange={(event) => setFormState((prev) => ({ ...prev, userBookId: event.target.value }))}
          >
            <option value="">Выберите книгу</option>
            {books.map((book) => (
              <option key={book.userBookId} value={book.userBookId}>
                {book.title} - {book.author}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          <label>
            Тип записи
            <select
              value={formState.type}
              onChange={(event) => setFormState((prev) => ({ ...prev, type: event.target.value }))}
            >
              <option value="note">Заметка</option>
              <option value="quote">Цитата</option>
            </select>
          </label>
          <label>
            Страница
            <input
              type="number"
              min="1"
              value={formState.pageNumber}
              onChange={(event) => setFormState((prev) => ({ ...prev, pageNumber: event.target.value }))}
            />
          </label>
        </div>
        <label>
          Текст
          <textarea
            rows="4"
            value={formState.content}
            onChange={(event) => setFormState((prev) => ({ ...prev, content: event.target.value }))}
          />
        </label>

        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? "Сохраняем..." : "Добавить запись"}
        </button>
      </form>
    </section>
  );
}

