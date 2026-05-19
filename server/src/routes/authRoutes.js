import bcrypt from "bcryptjs";
import express from "express";
import jwt from "jsonwebtoken";
import config from "../config.js";
import db from "../db/connection.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_BLOCK_MINUTES = 10;
const loginAttemptStore = new Map();

function buildToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
    },
    config.jwtSecret,
    { expiresIn: "7d" },
  );
}

function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
  };
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function getAttemptKey(email, req) {
  const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
  return `${email}::${ip}`;
}

function getAttemptEntry(key) {
  const entry = loginAttemptStore.get(key);

  if (!entry) {
    return null;
  }

  if (entry.blockedUntil && entry.blockedUntil <= Date.now()) {
    loginAttemptStore.delete(key);
    return null;
  }

  return entry;
}

function registerFailedAttempt(key) {
  const current = getAttemptEntry(key) || { count: 0, blockedUntil: null };
  const nextCount = current.count + 1;
  const nextEntry = {
    count: nextCount,
    blockedUntil: nextCount >= MAX_LOGIN_ATTEMPTS ? Date.now() + LOGIN_BLOCK_MINUTES * 60 * 1000 : null,
  };

  loginAttemptStore.set(key, nextEntry);
  return nextEntry;
}

function clearAttempts(key) {
  loginAttemptStore.delete(key);
}

router.post("/register", (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password || password.length < 6) {
    return res.status(400).json({ message: "Укажите имя, email и пароль не короче 6 символов." });
  }

  const normalizedEmail = normalizeEmail(email);
  const existingUser = db.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail);

  if (existingUser) {
    return res.status(409).json({ message: "Пользователь с таким email уже существует." });
  }

  const result = db.prepare(`
    INSERT INTO users (name, email, password_hash)
    VALUES (?, ?, ?)
  `).run(String(name).trim(), normalizedEmail, bcrypt.hashSync(password, 10));

  const user = db.prepare("SELECT id, name, email FROM users WHERE id = ?").get(result.lastInsertRowid);
  const token = buildToken(user);

  return res.status(201).json({
    token,
    user: toPublicUser(user),
  });
});

router.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Введите email и пароль." });
  }

  const normalizedEmail = normalizeEmail(email);
  const attemptKey = getAttemptKey(normalizedEmail, req);
  const attemptEntry = getAttemptEntry(attemptKey);

  if (attemptEntry?.blockedUntil) {
    const minutesLeft = Math.max(1, Math.ceil((attemptEntry.blockedUntil - Date.now()) / 60000));
    return res.status(429).json({
      message: `Слишком много неудачных попыток входа. Повторите через ${minutesLeft} мин.`,
    });
  }

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(normalizedEmail);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    registerFailedAttempt(attemptKey);
    return res.status(401).json({ message: "Неверный email или пароль." });
  }

  clearAttempts(attemptKey);

  const token = buildToken(user);

  return res.json({
    token,
    user: toPublicUser(user),
  });
});

router.post("/reset-password", (req, res) => {
  const { email, password } = req.body;

  const normalizedEmail = normalizeEmail(email);
  const nextPassword = String(password || "");

  if (!normalizedEmail || !nextPassword || nextPassword.length < 6) {
    return res.status(400).json({ message: "Укажите email и новый пароль не короче 6 символов." });
  }

  const user = db.prepare("SELECT id, name, email FROM users WHERE email = ?").get(normalizedEmail);

  if (!user) {
    return res.status(404).json({ message: "Пользователь с таким email не найден." });
  }

  db.prepare(`
    UPDATE users
    SET password_hash = ?
    WHERE id = ?
  `).run(bcrypt.hashSync(nextPassword, 10), user.id);

  for (const key of loginAttemptStore.keys()) {
    if (key.startsWith(`${normalizedEmail}::`)) {
      loginAttemptStore.delete(key);
    }
  }

  return res.json({
    message: "Пароль успешно обновлен. Теперь можно войти с новым паролем.",
  });
});

router.get("/me", requireAuth, (req, res) => {
  const user = db.prepare("SELECT id, name, email FROM users WHERE id = ?").get(req.user.id);

  if (!user) {
    return res.status(404).json({ message: "Пользователь не найден." });
  }

  return res.json({ user: toPublicUser(user) });
});

export default router;
