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
    confirmPassword: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const isResetMode = mode === "reset";

  if (isAuthenticated && !isResetMode) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");

    if (isResetMode && formState.password !== formState.confirmPassword) {
      setBusy(false);
      setError("Подтверждение пароля не совпадает.");
      return;
    }

    try {
      if (isResetMode) {
        const data = await apiRequest("/auth/reset-password", {
          method: "POST",
          body: {
            email: formState.email,
            password: formState.password,
          },
        });
        setSuccess(data.message);
        setFormState((prev) => ({
          ...prev,
          password: "",
          confirmPassword: "",
        }));
      } else {
        const data = await apiRequest(mode === "login" ? "/auth/login" : "/auth/register", {
          method: "POST",
          body: formState,
        });
        login(data);
      }
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
        <h2>{mode === "login" ? "Вход" : isResetMode ? "Восстановление пароля" : "Регистрация"}</h2>
        <p>
          {mode === "login"
            ? "Можно сразу зайти через демо-аккаунт."
            : isResetMode
              ? "Учебный упрощенный сценарий: укажите email и задайте новый пароль."
              : "Создайте отдельный аккаунт для тестирования."}
        </p>

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
            {isResetMode ? "Новый пароль" : "Пароль"}
            <input
              type="password"
              value={formState.password}
              onChange={(event) => setFormState((prev) => ({ ...prev, password: event.target.value }))}
            />
          </label>
          {isResetMode ? (
            <label>
              Подтвердите новый пароль
              <input
                type="password"
                value={formState.confirmPassword}
                onChange={(event) => setFormState((prev) => ({ ...prev, confirmPassword: event.target.value }))}
              />
            </label>
          ) : null}

          {error ? <div className="form-error">{error}</div> : null}
          {success ? <div className="form-success">{success}</div> : null}

          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? "Подождите..." : mode === "login" ? "Войти" : isResetMode ? "Обновить пароль" : "Зарегистрироваться"}
          </button>
        </form>

        <div className="auth-links">
          {mode === "login" ? <Link to="/register">Создать новый аккаунт</Link> : <Link to="/login">Уже есть аккаунт</Link>}
          {mode === "login" ? <Link to="/reset-password">Забыли пароль?</Link> : null}
          {isResetMode ? <Link to="/login">Вернуться ко входу</Link> : null}
        </div>
      </section>
    </main>
  );
}
