import { useEffect, useState } from "react";
import { apiRequest } from "../api/http";
import { useAuth } from "../auth/AuthContext";
import { BookForm } from "../components/BookForm";
import { BookList } from "../components/BookList";
import { ChartsPanel } from "../components/ChartsPanel";
import { EntryForm } from "../components/EntryForm";
import { ExportPreviewModal } from "../components/ExportPreviewModal";
import { Recommendations } from "../components/Recommendations";
import { SessionForm } from "../components/SessionForm";
import { StatsGrid } from "../components/StatsGrid";

function downloadBlob(blob, fileName) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.URL.revokeObjectURL(url);
}

export function DashboardPage() {
  const { token, user, logout } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [previewBook, setPreviewBook] = useState(null);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await apiRequest("/library/dashboard", { token });
      setDashboard(data);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const executeAction = async (key, factory) => {
    setBusyAction(key);

    try {
      const data = await factory();
      setDashboard(data);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyAction("");
    }
  };

  const downloadExport = async (userBookId, format) => {
    try {
      const { blob, fileName } = await apiRequest(`/library/books/${userBookId}/export?format=${format}`, {
        token,
        responseType: "blob",
      });
      downloadBlob(blob, fileName || `book-export.${format}`);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  if (loading) {
    return <div className="fullscreen-message">Загружаем ваш дневник чтения...</div>;
  }

  if (!dashboard) {
    return (
      <div className="fullscreen-message">
        <p>{error || "Не удалось загрузить dashboard."}</p>
        <button className="primary-button" type="button" onClick={loadDashboard}>
          Повторить
        </button>
      </div>
    );
  }

  return (
    <>
      <main className="app-shell">
        <header className="topbar">
          <div>
            <span className="eyebrow">Reader Diary</span>
            <h1>Добро пожаловать, {user?.name}</h1>
            <p>Планируйте чтение, фиксируйте сессии и собирайте собственную карту книг.</p>
          </div>
          <button className="secondary-button" type="button" onClick={logout}>
            Выйти
          </button>
        </header>

        {error ? <div className="banner-error">{error}</div> : null}

        <StatsGrid summary={dashboard.summary} />

        <section className="three-column-layout">
          <BookForm
            catalog={dashboard.catalog}
            busy={busyAction === "book"}
            onSubmit={(payload) =>
              executeAction("book", () =>
                apiRequest("/library/books", {
                  method: "POST",
                  token,
                  body: payload,
                }),
              )
            }
          />
          <SessionForm
            books={dashboard.userBooks}
            busy={busyAction === "session"}
            onSubmit={(payload) =>
              executeAction("session", () =>
                apiRequest(`/library/books/${payload.userBookId}/sessions`, {
                  method: "POST",
                  token,
                  body: payload,
                }),
              )
            }
          />
          <EntryForm
            books={dashboard.userBooks}
            busy={busyAction === "entry"}
            onSubmit={(payload) =>
              executeAction("entry", () =>
                apiRequest(`/library/books/${payload.userBookId}/notes`, {
                  method: "POST",
                  token,
                  body: payload,
                }),
              )
            }
          />
        </section>

        <ChartsPanel pagesPerDay={dashboard.pagesPerDay} booksPerYear={dashboard.booksPerYear} />

        <section className="content-grid">
          <BookList
            books={dashboard.userBooks}
            busy={busyAction === "update"}
            onUpdate={(userBookId, payload) =>
              executeAction("update", () =>
                apiRequest(`/library/books/${userBookId}`, {
                  method: "PUT",
                  token,
                  body: payload,
                }),
              )
            }
            onPreview={setPreviewBook}
            onExport={downloadExport}
          />

          <div className="stack-column">
            <Recommendations items={dashboard.recommendations} />

            <section className="panel">
              <div className="panel-header">
                <h2>Последние записи</h2>
                <p>Быстрый обзор заметок и цитат по книгам.</p>
              </div>

              <div className="entry-list">
                {dashboard.recentEntries.map((entry) => (
                  <article key={entry.id} className="entry-card">
                    <strong>{entry.type === "quote" ? "Цитата" : "Заметка"}</strong>
                    <span>{entry.title}</span>
                    <p>{entry.content}</p>
                    <small>Стр. {entry.pageNumber || "-"}</small>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </section>
      </main>

      <ExportPreviewModal
        book={previewBook}
        token={token}
        isOpen={Boolean(previewBook)}
        onClose={() => setPreviewBook(null)}
        onError={setError}
      />
    </>
  );
}
