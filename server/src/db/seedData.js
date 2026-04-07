export const DEMO_USER = {
  name: "Демо Читатель",
  email: "demo@reader.local",
  password: "Reader123!",
};

const titleStarts = [
  "Тихий",
  "Стеклянный",
  "Северный",
  "Последний",
  "Скрытый",
  "Лунный",
  "Золотой",
  "Пыльный",
  "Янтарный",
  "Ночной",
];

const titleEnds = [
  "архив",
  "сад",
  "компас",
  "маяк",
  "город",
  "дневник",
  "перевал",
  "часовщик",
  "океан",
  "лабиринт",
];

const authors = [
  "Анна Морозова",
  "Илья Ветров",
  "Софья Адамова",
  "Роман Лебедев",
  "Марина Волкова",
  "Павел Ордин",
  "Екатерина Светлова",
  "Денис Старков",
  "Дарья Речная",
  "Никита Белозеров",
  "Ольга Горина",
  "Артем Соколов",
  "Валерия Тихонова",
  "Михаил Платов",
  "Алиса Невская",
  "Тимур Крылов",
  "Вероника Каменева",
  "Кирилл Озеров",
  "Полина Серебрякова",
  "Егор Лавров",
];

const genreSets = [
  ["Фэнтези", "Приключения"],
  ["Фантастика", "Драма"],
  ["Детектив", "Триллер"],
  ["История", "Биография"],
  ["Психология", "Саморазвитие"],
  ["Научпоп", "Технологии"],
  ["Классика", "Драма"],
  ["Романтика", "Современная проза"],
  ["Мистика", "Триллер"],
  ["Антиутопия", "Фантастика"],
];

const topics = [
  "памяти семьи",
  "сложном выборе между долгом и мечтой",
  "маленьком городе с большими тайнами",
  "поиске собственного ритма жизни",
  "неожиданной дружбе и доверии",
  "будущем, которое можно изменить",
  "цене амбиций и личной свободы",
  "дороге домой через внутренние перемены",
  "исследовании забытых архивов",
  "столкновении науки и человеческих чувств",
];

const coverColors = [
  "#c96f51",
  "#6d8b74",
  "#46627f",
  "#b38c4d",
  "#7d5a74",
  "#4f7a78",
  "#b45d6d",
  "#758f3f",
  "#8a6d5f",
  "#5f6b9a",
];

function daysAgo(days) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export function buildCatalog() {
  return titleStarts.flatMap((start, groupIndex) =>
    titleEnds.map((end, itemIndex) => {
      const index = groupIndex * titleEnds.length + itemIndex;
      const genres = genreSets[index % genreSets.length];

      return {
        title: `${start} ${end}`,
        author: authors[index % authors.length],
        totalPages: 220 + ((index * 17) % 280),
        publishedYear: 2010 + (index % 16),
        genres,
        description: `Роман о ${topics[index % topics.length]}, где личная история героя постепенно превращается в маршрут взросления и выбора.`,
        coverColor: coverColors[index % coverColors.length],
      };
    }),
  );
}

export function buildDemoLibrary(bookRows) {
  const selectedBooks = bookRows.slice(0, 24);

  return selectedBooks.map((book, index) => {
    const completed = index < 10;
    const reading = index >= 10 && index < 18;
    const status = completed ? "completed" : reading ? "reading" : "paused";
    const progressBase = completed
      ? 1
      : reading
        ? 0.28 + (index % 5) * 0.11
        : 0.15 + (index % 4) * 0.09;

    const currentPage = Math.min(
      book.totalPages,
      completed ? book.totalPages : Math.max(24, Math.round(book.totalPages * progressBase)),
    );

    const progress = Math.round((currentPage / book.totalPages) * 100);
    const startedAt = daysAgo(90 - index * 2);
    const finishedAt = completed ? daysAgo(40 - index) : null;
    const rating = completed ? 3 + (index % 3) : reading ? 4 : null;
    const sessions = [];
    const sessionCount = completed ? 4 : reading ? 3 : 2;
    let accumulatedPage = 0;

    for (let sessionIndex = 0; sessionIndex < sessionCount; sessionIndex += 1) {
      const remainingPages = currentPage - accumulatedPage;
      const sessionsLeft = sessionCount - sessionIndex;
      const pagesForSession =
        sessionIndex === sessionCount - 1
          ? remainingPages
          : Math.max(12, Math.round(remainingPages / sessionsLeft));

      const startPage = accumulatedPage;
      const endPage = Math.min(currentPage, startPage + pagesForSession);
      accumulatedPage = endPage;

      sessions.push({
        sessionDate: daysAgo(24 - index - sessionIndex * 2),
        minutes: 25 + ((index + sessionIndex) % 5) * 10,
        pagesRead: endPage - startPage,
        startPage,
        endPage,
      });
    }

    const notes = [];
    if (index < 8) {
      notes.push({
        type: "note",
        pageNumber: Math.max(8, Math.round(currentPage * 0.35)),
        content: `Важно вернуться к этой мысли из книги "${book.title}" и использовать ее в личном плане чтения.`,
      });
    }

    if (index < 6) {
      notes.push({
        type: "quote",
        pageNumber: Math.max(12, Math.round(currentPage * 0.6)),
        content: "Иногда именно тишина помогает герою понять, куда он идет дальше.",
      });
    }

    return {
      bookId: book.id,
      status,
      currentPage,
      progress,
      rating,
      startedAt,
      finishedAt,
      sessions,
      notes,
    };
  });
}
