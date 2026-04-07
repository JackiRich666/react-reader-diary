import { useMemo, useState } from "react";

const initialCustomState = {
  title: "",
  author: "",
  totalPages: "",
  publishedYear: "",
  genres: "",
  description: "",
  status: "reading",
};

export function BookForm({ catalog, onSubmit, busy }) {
  const [mode, setMode] = useState("catalog");
  const [catalogBookId, setCatalogBookId] = useState("");
  const [customForm, setCustomForm] = useState(initialCustomState);

  const availableCatalog = useMemo(() => catalog.filter((book) => !book.alreadyAdded), [catalog]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (mode === "catalog") {
      if (!catalogBookId) {
        return;
      }

      await onSubmit({
        bookId: Number(catalogBookId),
        status: customForm.status,
      });
      setCatalogBookId("");
      return;
    }

    await onSubmit({
      ...customForm,
      totalPages: Number(customForm.totalPages),
      publishedYear: customForm.publishedYear ? Number(customForm.publishedYear) : null,
    });
    setCustomForm(initialCustomState);
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Добавить книгу</h2>
        <p>Можно выбрать из каталога или создать новую карточку вручную.</p>
      </div>

      <div className="toggle-row">
        <button
          type="button"
          className={mode === "catalog" ? "toggle-chip active" : "toggle-chip"}
          onClick={() => setMode("catalog")}
        >
          Из каталога
        </button>
        <button
          type="button"
          className={mode === "custom" ? "toggle-chip active" : "toggle-chip"}
          onClick={() => setMode("custom")}
        >
          Новая книга
        </button>
      </div>

      <form className="panel-form" onSubmit={handleSubmit}>
        {mode === "catalog" ? (
          <label>
            Книга из базы
            <select value={catalogBookId} onChange={(event) => setCatalogBookId(event.target.value)}>
              <option value="">Выберите книгу</option>
              {availableCatalog.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.title} - {book.author}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label>
              Название
              <input
                value={customForm.title}
                onChange={(event) => setCustomForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Например, Дом туманных страниц"
              />
            </label>
            <label>
              Автор
              <input
                value={customForm.author}
                onChange={(event) => setCustomForm((prev) => ({ ...prev, author: event.target.value }))}
                placeholder="Имя автора"
              />
            </label>
            <div className="form-grid">
              <label>
                Страниц
                <input
                  type="number"
                  min="1"
                  value={customForm.totalPages}
                  onChange={(event) => setCustomForm((prev) => ({ ...prev, totalPages: event.target.value }))}
                />
              </label>
              <label>
                Год
                <input
                  type="number"
                  value={customForm.publishedYear}
                  onChange={(event) => setCustomForm((prev) => ({ ...prev, publishedYear: event.target.value }))}
                />
              </label>
            </div>
            <label>
              Жанры
              <input
                value={customForm.genres}
                onChange={(event) => setCustomForm((prev) => ({ ...prev, genres: event.target.value }))}
                placeholder="Фэнтези, Детектив"
              />
            </label>
            <label>
              Краткое описание
              <textarea
                rows="3"
                value={customForm.description}
                onChange={(event) => setCustomForm((prev) => ({ ...prev, description: event.target.value }))}
              />
            </label>
          </>
        )}

        <label>
          Статус при добавлении
          <select
            value={customForm.status}
            onChange={(event) => setCustomForm((prev) => ({ ...prev, status: event.target.value }))}
          >
            <option value="reading">Читаю</option>
            <option value="completed">Прочитано</option>
            <option value="paused">Отложено</option>
          </select>
        </label>

        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? "Сохраняем..." : "Добавить в дневник"}
        </button>
      </form>
    </section>
  );
}

