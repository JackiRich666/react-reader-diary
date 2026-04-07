import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function ProtectedRoute({ children }) {
  const { authReady, isAuthenticated } = useAuth();

  if (!authReady) {
    return <div className="fullscreen-message">Проверяем сессию...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
