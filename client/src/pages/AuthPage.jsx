import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { apiRequest } from "../api/http";
import { useAuth } from "../auth/AuthContext";

export function AuthPage({ mode }) {
  const { isAuthenticated, login } = useAuth();
  const [formState, setFormState] = useState({
    name: "",
    email: mode === "login" ? "demo@reader.local" : "",
    password: mode === "login" ? "Reader123!" : "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const data = await apiRequest(mode === "login" ? "/auth/login" : "/auth/register", {
        method: "POST",
        body: formState,
      });
      login(data);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-hero">
        <span className="eyebrow">Reader Diary</span>
        <h1>Читательский дневник с прогрессом, заметками и рекомендациями</h1>
        <p>
          Учебное React-приложение для учета чтения книг, статистики по сессиям и подготовки личной цифровой
          библиотеки.
        </p>
      </section>

      <section className="auth-card">
        <h2>{mode === "login" ? "Вход" : "Регистрация"}</h2>
        <p>{mode === "login" ? "Можно сразу зайти через демо-аккаунт." : "Создайте отдельный аккаунт для тестирования."}</p>

        <form className="panel-form" onSubmit={handleSubmit}>
          {mode === "register" ? (
            <label>
              Имя
              <input
                value={formState.name}
                onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
              />
            </label>
          ) : null}
          <label>
            Email
            <input
              type="email"
              value={formState.email}
              onChange={(event) => setFormState((prev) => ({ ...prev, email: event.target.value }))}
            />
          </label>
          <label>
            Пароль
            <input
              type="password"
              value={formState.password}
              onChange={(event) => setFormState((prev) => ({ ...prev, password: event.target.value }))}
            />
          </label>

          {error ? <div className="form-error">{error}</div> : null}

          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? "Подождите..." : mode === "login" ? "Войти" : "Зарегистрироваться"}
          </button>
        </form>

        <div className="auth-links">
          {mode === "login" ? (
            <Link to="/register">Создать новый аккаунт</Link>
          ) : (
            <Link to="/login">Уже есть аккаунт</Link>
          )}
        </div>
      </section>
    </main>
  );
}

