import bcrypt from "bcryptjs";
import express from "express";
import jwt from "jsonwebtoken";
import config from "../config.js";
import db from "../db/connection.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

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

router.post("/register", (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password || password.length < 6) {
    return res.status(400).json({ message: "Укажите имя, email и пароль не короче 6 символов." });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
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

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(String(email).trim().toLowerCase());

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ message: "Неверный email или пароль." });
  }

  const token = buildToken(user);

  return res.json({
    token,
    user: toPublicUser(user),
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

