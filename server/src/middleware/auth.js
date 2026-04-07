import jwt from "jsonwebtoken";
import config from "../config.js";

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Требуется авторизация." });
  }

  const token = authHeader.slice("Bearer ".length);

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Сессия истекла. Войдите снова." });
  }
}

