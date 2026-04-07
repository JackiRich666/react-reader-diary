import db from "../db/connection.js";

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function getPagesPerDay(userId, days = 7) {
  const now = new Date();
  now.setHours(12, 0, 0, 0);

  const dates = [];
  const buckets = new Map();

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const currentDate = new Date(now);
    currentDate.setDate(now.getDate() - offset);
    const key = formatDate(currentDate);
    dates.push(key);
    buckets.set(key, 0);
  }

  const rows = db.prepare(`
    SELECT rs.session_date AS sessionDate, SUM(rs.pages_read) AS totalPages
    FROM reading_sessions rs
    JOIN user_books ub ON ub.id = rs.user_book_id
    WHERE ub.user_id = ? AND rs.session_date >= ?
    GROUP BY rs.session_date
    ORDER BY rs.session_date ASC
  `).all(userId, dates[0]);

  for (const row of rows) {
    if (buckets.has(row.sessionDate)) {
      buckets.set(row.sessionDate, row.totalPages);
    }
  }

  return dates.map((date) => ({
    date,
    pages: buckets.get(date),
  }));
}

function getBooksPerYear(userId, years = 5) {
  const currentYear = new Date().getFullYear();
  const labels = [];
  const buckets = new Map();

  for (let year = currentYear - (years - 1); year <= currentYear; year += 1) {
    const label = String(year);
    labels.push(label);
    buckets.set(label, 0);
  }

  const rows = db.prepare(`
    SELECT strftime('%Y', finished_at) AS year, COUNT(*) AS total
    FROM user_books
    WHERE user_id = ? AND finished_at IS NOT NULL
    GROUP BY strftime('%Y', finished_at)
    ORDER BY year ASC
  `).all(userId);

  for (const row of rows) {
    if (row.year && buckets.has(row.year)) {
      buckets.set(row.year, row.total);
    }
  }

  return labels.map((year) => ({
    year,
    books: buckets.get(year),
  }));
}

export function getSummary(userId) {
  const counts = db.prepare(`
    SELECT
      COUNT(*) AS totalBooks,
      SUM(CASE WHEN status = 'reading' THEN 1 ELSE 0 END) AS readingBooks,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completedBooks,
      SUM(CASE WHEN status = 'paused' THEN 1 ELSE 0 END) AS pausedBooks,
      SUM(current_page) AS totalPagesRead
    FROM user_books
    WHERE user_id = ?
  `).get(userId);

  const minutes = db.prepare(`
    SELECT COALESCE(SUM(rs.minutes), 0) AS totalMinutes
    FROM reading_sessions rs
    JOIN user_books ub ON ub.id = rs.user_book_id
    WHERE ub.user_id = ?
  `).get(userId);

  const entries = db.prepare(`
    SELECT COUNT(*) AS totalEntries
    FROM notes n
    JOIN user_books ub ON ub.id = n.user_book_id
    WHERE ub.user_id = ?
  `).get(userId);

  return {
    totalBooks: counts.totalBooks || 0,
    readingBooks: counts.readingBooks || 0,
    completedBooks: counts.completedBooks || 0,
    pausedBooks: counts.pausedBooks || 0,
    totalPagesRead: counts.totalPagesRead || 0,
    totalMinutes: minutes.totalMinutes || 0,
    totalEntries: entries.totalEntries || 0,
  };
}

export function getStats(userId) {
  return {
    summary: getSummary(userId),
    pagesPerDay: getPagesPerDay(userId),
    booksPerYear: getBooksPerYear(userId),
  };
}

