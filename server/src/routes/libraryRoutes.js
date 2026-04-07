import express from "express";
import db from "../db/connection.js";
import { requireAuth } from "../middleware/auth.js";
import { buildExportPayload } from "../services/exportService.js";
import { getRecommendations } from "../services/recommendationService.js";
import { getStats } from "../services/statsService.js";

const router = express.Router();
const SUPPORTED_EXPORT_FORMATS = new Set(["md", "json", "txt", "pdf"]);

function parseGenres(rawGenres) {
  try {
    const parsed = JSON.parse(rawGenres || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function normalizeStatus(status) {
  if (status === "completed" || status === "paused") {
    return status;
  }
  return "reading";
}

function serializeBook(row) {
  return {
    userBookId: row.userBookId,
    bookId: row.bookId,
    title: row.title,
    author: row.author,
    totalPages: row.totalPages,
    publishedYear: row.publishedYear,
    genres: parseGenres(row.genres),
    description: row.description,
    coverColor: row.coverColor,
    status: row.status,
    currentPage: row.currentPage,
    progress: row.progress,
    rating: row.rating,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}

function getUserBookRow(userId, userBookId) {
  return db.prepare(`
    SELECT
      ub.id AS userBookId,
      ub.status,
      ub.current_page AS currentPage,
      ub.progress,
      ub.rating,
      ub.started_at AS startedAt,
      ub.finished_at AS finishedAt,
      b.id AS bookId,
      b.title,
      b.author,
      b.total_pages AS totalPages,
      b.published_year AS publishedYear,
      b.genres,
      b.description,
      b.cover_color AS coverColor
    FROM user_books ub
    JOIN books b ON b.id = ub.book_id
    WHERE ub.user_id = ? AND ub.id = ?
  `).get(userId, userBookId);
}

function getUserBooks(userId) {
  const rows = db.prepare(`
    SELECT
      ub.id AS userBookId,
      ub.status,
      ub.current_page AS currentPage,
      ub.progress,
      ub.rating,
      ub.started_at AS startedAt,
      ub.finished_at AS finishedAt,
      b.id AS bookId,
      b.title,
      b.author,
      b.total_pages AS totalPages,
      b.published_year AS publishedYear,
      b.genres,
      b.description,
      b.cover_color AS coverColor,
      (
        SELECT COUNT(*)
        FROM notes n
        WHERE n.user_book_id = ub.id
      ) AS noteCount,
      (
        SELECT COUNT(*)
        FROM reading_sessions rs
        WHERE rs.user_book_id = ub.id
      ) AS sessionCount,
      (
        SELECT MAX(session_date)
        FROM reading_sessions rs
        WHERE rs.user_book_id = ub.id
      ) AS lastSessionDate
    FROM user_books ub
    JOIN books b ON b.id = ub.book_id
    WHERE ub.user_id = ?
    ORDER BY
      CASE ub.status
        WHEN 'reading' THEN 0
        WHEN 'paused' THEN 1
        ELSE 2
      END,
      ub.updated_at DESC,
      b.title ASC
  `).all(userId);

  return rows.map((row) => ({
    ...serializeBook(row),
    noteCount: row.noteCount,
    sessionCount: row.sessionCount,
    lastSessionDate: row.lastSessionDate,
  }));
}

function getCatalog(userId) {
  const rows = db.prepare(`
    SELECT
      b.id,
      b.title,
      b.author,
      b.total_pages AS totalPages,
      b.published_year AS publishedYear,
      b.genres,
      b.description,
      b.cover_color AS coverColor,
      CASE WHEN ub.id IS NULL THEN 0 ELSE 1 END AS alreadyAdded
    FROM books b
    LEFT JOIN user_books ub ON ub.book_id = b.id AND ub.user_id = ?
    ORDER BY b.title ASC
  `).all(userId);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    author: row.author,
    totalPages: row.totalPages,
    publishedYear: row.publishedYear,
    genres: parseGenres(row.genres),
    description: row.description,
    coverColor: row.coverColor,
    alreadyAdded: Boolean(row.alreadyAdded),
  }));
}

function getRecentEntries(userId) {
  return db.prepare(`
    SELECT
      n.id,
      n.type,
      n.page_number AS pageNumber,
      n.content,
      n.created_at AS createdAt,
      b.title
    FROM notes n
    JOIN user_books ub ON ub.id = n.user_book_id
    JOIN books b ON b.id = ub.book_id
    WHERE ub.user_id = ?
    ORDER BY n.created_at DESC
    LIMIT 8
  `).all(userId);
}

function getDashboard(userId) {
  const stats = getStats(userId);

  return {
    summary: stats.summary,
    pagesPerDay: stats.pagesPerDay,
    booksPerYear: stats.booksPerYear,
    userBooks: getUserBooks(userId),
    catalog: getCatalog(userId),
    recommendations: getRecommendations(userId),
    recentEntries: getRecentEntries(userId),
  };
}

function encodeContentDispositionFileName(fileName) {
  return encodeURIComponent(fileName)
    .replace(/['()]/g, escape)
    .replace(/\*/g, "%2A");
}

function buildContentDispositionHeader(payload) {
  const utf8FileName = payload.downloadName || payload.fileName;
  return `attachment; filename="${payload.fileName}"; filename*=UTF-8''${encodeContentDispositionFileName(utf8FileName)}`;
}

router.use(requireAuth);

router.get("/dashboard", (req, res) => {
  return res.json(getDashboard(req.user.id));
});

router.post("/books", (req, res) => {
  const { bookId, title, author, totalPages, publishedYear, genres, description, status } = req.body;
  let nextBookId = bookId ? Number(bookId) : null;

  if (!nextBookId) {
    if (!title || !author || !totalPages) {
      return res.status(400).json({ message: "Для новой книги заполните название, автора и число страниц." });
    }

    const result = db.prepare(`
      INSERT INTO books (title, author, total_pages, published_year, genres, description, cover_color, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(title).trim(),
      String(author).trim(),
      Number(totalPages),
      publishedYear ? Number(publishedYear) : null,
      JSON.stringify(
        Array.isArray(genres)
          ? genres
          : String(genres || "")
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
      ),
      String(description || "").trim(),
      "#46627f",
      req.user.id,
    );

    nextBookId = result.lastInsertRowid;
  }

  const alreadyAdded = db.prepare(`
    SELECT id FROM user_books WHERE user_id = ? AND book_id = ?
  `).get(req.user.id, nextBookId);

  if (alreadyAdded) {
    return res.status(409).json({ message: "Эта книга уже добавлена в вашу библиотеку." });
  }

  const book = db.prepare("SELECT total_pages FROM books WHERE id = ?").get(nextBookId);

  if (!book) {
    return res.status(404).json({ message: "Книга не найдена." });
  }

  const normalizedStatus = normalizeStatus(status);
  const today = new Date().toISOString().slice(0, 10);
  const isCompleted = normalizedStatus === "completed";

  db.prepare(`
    INSERT INTO user_books (user_id, book_id, status, current_page, progress, started_at, finished_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.id,
    nextBookId,
    normalizedStatus,
    isCompleted ? book.total_pages : 0,
    isCompleted ? 100 : 0,
    today,
    isCompleted ? today : null,
  );

  return res.status(201).json(getDashboard(req.user.id));
});

router.put("/books/:id", (req, res) => {
  const userBookId = Number(req.params.id);
  const row = getUserBookRow(req.user.id, userBookId);

  if (!row) {
    return res.status(404).json({ message: "Книга пользователя не найдена." });
  }

  const nextStatus = normalizeStatus(req.body.status || row.status);
  const requestedCurrentPage =
    req.body.currentPage === undefined || req.body.currentPage === null
      ? row.currentPage
      : Number(req.body.currentPage);
  const nextCurrentPage =
    nextStatus === "completed"
      ? row.totalPages
      : Math.max(0, Math.min(row.totalPages, requestedCurrentPage));
  const nextProgress = Math.round((nextCurrentPage / row.totalPages) * 100);
  const nextRating =
    req.body.rating === undefined || req.body.rating === null || req.body.rating === ""
      ? null
      : Number(req.body.rating);
  const finishedAt = nextStatus === "completed" ? new Date().toISOString().slice(0, 10) : null;

  db.prepare(`
    UPDATE user_books
    SET status = ?, current_page = ?, progress = ?, rating = ?, finished_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(nextStatus, nextCurrentPage, nextProgress, nextRating, finishedAt, userBookId);

  return res.json(getDashboard(req.user.id));
});

router.post("/books/:id/sessions", (req, res) => {
  const userBookId = Number(req.params.id);
  const row = getUserBookRow(req.user.id, userBookId);

  if (!row) {
    return res.status(404).json({ message: "Книга пользователя не найдена." });
  }

  const minutes = Number(req.body.minutes);
  const pagesRead = Number(req.body.pagesRead);
  const sessionDate = req.body.sessionDate || new Date().toISOString().slice(0, 10);

  if (Number.isNaN(minutes) || minutes <= 0 || Number.isNaN(pagesRead) || pagesRead < 0) {
    return res.status(400).json({ message: "Укажите корректные минуты и страницы сессии." });
  }

  const startPage = row.currentPage;
  const endPage = Math.min(row.totalPages, row.currentPage + pagesRead);
  const actualPagesRead = Math.max(0, endPage - startPage);
  const completed = endPage >= row.totalPages;
  const nextStatus = completed ? "completed" : "reading";
  const nextProgress = Math.round((endPage / row.totalPages) * 100);

  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO reading_sessions (user_book_id, session_date, minutes, pages_read, start_page, end_page)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userBookId, sessionDate, minutes, actualPagesRead, startPage, endPage);

    db.prepare(`
      UPDATE user_books
      SET status = ?, current_page = ?, progress = ?, finished_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(nextStatus, endPage, nextProgress, completed ? sessionDate : null, userBookId);
  });

  transaction();

  return res.status(201).json(getDashboard(req.user.id));
});

router.post("/books/:id/notes", (req, res) => {
  const userBookId = Number(req.params.id);
  const row = getUserBookRow(req.user.id, userBookId);

  if (!row) {
    return res.status(404).json({ message: "Книга пользователя не найдена." });
  }

  const type = req.body.type === "quote" ? "quote" : "note";
  const content = String(req.body.content || "").trim();
  const pageNumber = req.body.pageNumber ? Number(req.body.pageNumber) : null;

  if (!content) {
    return res.status(400).json({ message: "Добавьте текст заметки или цитаты." });
  }

  db.prepare(`
    INSERT INTO notes (user_book_id, type, page_number, content)
    VALUES (?, ?, ?, ?)
  `).run(userBookId, type, pageNumber, content);

  return res.status(201).json(getDashboard(req.user.id));
});

router.get("/books/:id/export", async (req, res, next) => {
  const userBookId = Number(req.params.id);
  const row = getUserBookRow(req.user.id, userBookId);

  if (!row) {
    return res.status(404).json({ message: "Книга пользователя не найдена." });
  }

  const sessions = db.prepare(`
    SELECT
      session_date AS sessionDate,
      minutes,
      pages_read AS pagesRead,
      start_page AS startPage,
      end_page AS endPage
    FROM reading_sessions
    WHERE user_book_id = ?
    ORDER BY session_date DESC
  `).all(userBookId);

  const notes = db.prepare(`
    SELECT
      type,
      page_number AS pageNumber,
      content,
      created_at AS createdAt
    FROM notes
    WHERE user_book_id = ?
    ORDER BY created_at DESC
  `).all(userBookId);

  const book = serializeBook(row);
  const format = String(req.query.format || "md").toLowerCase();

  if (!SUPPORTED_EXPORT_FORMATS.has(format)) {
    return res.status(400).json({ message: "Неподдерживаемый формат экспорта." });
  }

  try {
    const payload = await buildExportPayload(book, sessions, notes, format);
    res.setHeader("Content-Type", payload.mimeType);
    res.setHeader("Content-Disposition", buildContentDispositionHeader(payload));
    return res.send(payload.body);
  } catch (error) {
    return next(error);
  }
});

export default router;
