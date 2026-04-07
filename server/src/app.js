import path from "node:path";
import cors from "cors";
import express from "express";
import morgan from "morgan";
import config from "./config.js";
import { initDatabase } from "./db/initDatabase.js";
import authRoutes from "./routes/authRoutes.js";
import libraryRoutes from "./routes/libraryRoutes.js";

initDatabase();

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRoutes);
app.use("/api/library", libraryRoutes);

if (config.serveClient) {
  app.use(express.static(config.clientDistPath));

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }

    return res.sendFile(path.resolve(config.clientIndexPath));
  });
}

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ message: "Внутренняя ошибка сервера." });
});

export default app;
