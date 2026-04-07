import db from "../db/connection.js";

function parseGenres(rawGenres) {
  try {
    const parsed = JSON.parse(rawGenres || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

export function getRecommendations(userId, limit = 6) {
  const preferenceRows = db.prepare(`
    SELECT b.author, b.genres, ub.rating, ub.status
    FROM user_books ub
    JOIN books b ON b.id = ub.book_id
    WHERE ub.user_id = ? AND (ub.status = 'completed' OR COALESCE(ub.rating, 0) >= 4)
  `).all(userId);

  const authorScore = new Map();
  const genreScore = new Map();

  for (const row of preferenceRows) {
    const weight = row.rating ? row.rating : row.status === "completed" ? 3 : 1;
    authorScore.set(row.author, (authorScore.get(row.author) || 0) + weight);

    for (const genre of parseGenres(row.genres)) {
      genreScore.set(genre, (genreScore.get(genre) || 0) + weight);
    }
  }

  const candidates = db.prepare(`
    SELECT *
    FROM books
    WHERE id NOT IN (
      SELECT book_id FROM user_books WHERE user_id = ?
    )
    ORDER BY published_year DESC, title ASC
  `).all(userId);

  return candidates
    .map((candidate) => {
      const genres = parseGenres(candidate.genres);
      const genrePoints = genres.reduce((total, genre) => total + (genreScore.get(genre) || 0), 0);
      const authorPoints = authorScore.get(candidate.author) || 0;
      const pagePoints = candidate.total_pages > 520 ? -1 : candidate.total_pages < 260 ? 1 : 2;

      return {
        id: candidate.id,
        title: candidate.title,
        author: candidate.author,
        totalPages: candidate.total_pages,
        publishedYear: candidate.published_year,
        genres,
        description: candidate.description,
        coverColor: candidate.cover_color,
        score: genrePoints + authorPoints + pagePoints,
      };
    })
    .sort((left, right) => right.score - left.score || right.publishedYear - left.publishedYear)
    .slice(0, limit);
}

