import bcrypt from "bcryptjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import db from "./connection.js";
import { buildCatalog, buildDemoLibrary, DEMO_USER } from "./seedData.js";

const dropStatements = [
  "DROP TABLE IF EXISTS notes",
  "DROP TABLE IF EXISTS reading_sessions",
  "DROP TABLE IF EXISTS user_books",
  "DROP TABLE IF EXISTS books",
  "DROP TABLE IF EXISTS users",
];

const createStatements = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    total_pages INTEGER NOT NULL CHECK (total_pages > 0),
    published_year INTEGER,
    genres TEXT NOT NULL DEFAULT '[]',
    description TEXT DEFAULT '',
    cover_color TEXT DEFAULT '#6d8b74',
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS user_books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    book_id INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('reading', 'completed', 'paused')),
    current_page INTEGER NOT NULL DEFAULT 0,
    progress INTEGER NOT NULL DEFAULT 0,
    rating INTEGER CHECK (rating BETWEEN 1 AND 5),
    started_at TEXT,
    finished_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, book_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS reading_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_book_id INTEGER NOT NULL,
    session_date TEXT NOT NULL,
    minutes INTEGER NOT NULL CHECK (minutes > 0),
    pages_read INTEGER NOT NULL CHECK (pages_read >= 0),
    start_page INTEGER NOT NULL DEFAULT 0,
    end_page INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_book_id) REFERENCES user_books(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_book_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('note', 'quote')),
    page_number INTEGER,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_book_id) REFERENCES user_books(id) ON DELETE CASCADE
  )`,
];

function createSchema() {
  for (const statement of createStatements) {
    db.prepare(statement).run();
  }
}

function resetSchema() {
  for (const statement of dropStatements) {
    db.prepare(statement).run();
  }
  createSchema();
}

function seedCatalog() {
  const count = db.prepare("SELECT COUNT(*) AS count FROM books").get().count;
  if (count > 0) {
    return;
  }

  const insertBook = db.prepare(`
    INSERT INTO books (title, author, total_pages, published_year, genres, description, cover_color, created_by)
    VALUES (@title, @author, @totalPages, @publishedYear, @genres, @description, @coverColor, NULL)
  `);

  const transaction = db.transaction((catalog) => {
    for (const book of catalog) {
      insertBook.run({
        ...book,
        genres: JSON.stringify(book.genres),
      });
    }
  });

  transaction(buildCatalog());
}

function seedDemoUser() {
  const existingUser = db.prepare("SELECT id FROM users WHERE email = ?").get(DEMO_USER.email);
  if (existingUser) {
    return existingUser.id;
  }

  const result = db.prepare(`
    INSERT INTO users (name, email, password_hash)
    VALUES (?, ?, ?)
  `).run(DEMO_USER.name, DEMO_USER.email, bcrypt.hashSync(DEMO_USER.password, 10));

  return result.lastInsertRowid;
}

function seedDemoLibrary(userId) {
  const count = db.prepare("SELECT COUNT(*) AS count FROM user_books WHERE user_id = ?").get(userId).count;
  if (count > 0) {
    return;
  }

  const books = db
    .prepare("SELECT id, title, author, total_pages FROM books ORDER BY id ASC")
    .all()
    .map((row) => ({
      ...row,
      totalPages: row.total_pages,
    }));

  const demoLibrary = buildDemoLibrary(books);
  const insertUserBook = db.prepare(`
    INSERT INTO user_books (user_id, book_id, status, current_page, progress, rating, started_at, finished_at)
    VALUES (@userId, @bookId, @status, @currentPage, @progress, @rating, @startedAt, @finishedAt)
  `);
  const insertSession = db.prepare(`
    INSERT INTO reading_sessions (user_book_id, session_date, minutes, pages_read, start_page, end_page)
    VALUES (@userBookId, @sessionDate, @minutes, @pagesRead, @startPage, @endPage)
  `);
  const insertNote = db.prepare(`
    INSERT INTO notes (user_book_id, type, page_number, content)
    VALUES (@userBookId, @type, @pageNumber, @content)
  `);

  const transaction = db.transaction(() => {
    for (const entry of demoLibrary) {
      const userBookResult = insertUserBook.run({
        userId,
        bookId: entry.bookId,
        status: entry.status,
        currentPage: entry.currentPage,
        progress: entry.progress,
        rating: entry.rating,
        startedAt: entry.startedAt,
        finishedAt: entry.finishedAt,
      });

      const userBookId = userBookResult.lastInsertRowid;

      for (const session of entry.sessions) {
        insertSession.run({
          userBookId,
          ...session,
        });
      }

      for (const note of entry.notes) {
        insertNote.run({
          userBookId,
          ...note,
        });
      }
    }
  });

  transaction();
}

export function initDatabase({ force = false } = {}) {
  if (force) {
    resetSchema();
  } else {
    createSchema();
  }

  seedCatalog();
  const demoUserId = seedDemoUser();
  seedDemoLibrary(demoUserId);
}

const currentFilePath = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === currentFilePath;

if (isDirectRun) {
  initDatabase({ force: process.argv.includes("--force") });
  console.log("Database initialized");
}

