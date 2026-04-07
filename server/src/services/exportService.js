import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

const INVALID_FILE_CHARS = /[<>:"/\\|?*\u0000-\u001F]+/g;
const PDF_FONT_CANDIDATES = [
  process.env.READER_DIARY_PDF_FONT,
  process.env.WINDIR ? path.join(process.env.WINDIR, "Fonts", "arial.ttf") : null,
  process.env.WINDIR ? path.join(process.env.WINDIR, "Fonts", "segoeui.ttf") : null,
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
  "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
];

let cachedPdfFontPath = null;

function formatStatus(status) {
  if (status === "completed") {
    return "Прочитано";
  }
  if (status === "paused") {
    return "Отложено";
  }
  return "Читаю";
}

function sanitizeUtf8FilePart(value, fallback) {
  const cleaned = String(value || "")
    .trim()
    .replace(INVALID_FILE_CHARS, " ")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return cleaned || fallback;
}

function buildFileNames(book, extension) {
  const titlePart = sanitizeUtf8FilePart(book.title, "book");
  const authorPart = sanitizeUtf8FilePart(book.author, "author");
  const utf8FileName = `${titlePart}_${authorPart}.${extension}`;
  const asciiFileName = `reader-diary-book-${book.bookId || book.userBookId || "export"}.${extension}`;

  return {
    asciiFileName,
    utf8FileName,
  };
}

function buildSections(book, sessions, notes) {
  const meta = [
    `Автор: ${book.author}`,
    `Статус: ${formatStatus(book.status)}`,
    `Прогресс: ${book.progress}%`,
    `Страницы: ${book.currentPage}/${book.totalPages}`,
    `Жанры: ${book.genres.join(", ")}`,
  ];

  const sessionLines =
    sessions.length === 0
      ? ["Сессий пока нет."]
      : sessions.map(
          (session) =>
            `${session.sessionDate}: ${session.pagesRead} стр., ${session.minutes} мин. (${session.startPage}-${session.endPage})`,
        );

  const noteLines =
    notes.length === 0
      ? ["Записей пока нет."]
      : notes.map(
          (note) =>
            `[${note.type === "quote" ? "Цитата" : "Заметка"}] стр. ${note.pageNumber || "-"}: ${note.content}`,
        );

  return {
    meta,
    sessionLines,
    noteLines,
  };
}

function buildMarkdownBody(book, sections) {
  const lines = [
    `# ${book.title}`,
    "",
    ...sections.meta,
    "",
    "## Сессии чтения",
    ...sections.sessionLines.map((line) => `- ${line}`),
    "",
    "## Заметки и цитаты",
    ...sections.noteLines.map((line) => `- ${line}`),
  ];

  return lines.join("\n");
}

function buildTextBody(book, sections) {
  const lines = [
    book.title,
    "",
    ...sections.meta,
    "",
    "Сессии чтения",
    ...sections.sessionLines.map((line) => `- ${line}`),
    "",
    "Заметки и цитаты",
    ...sections.noteLines.map((line) => `- ${line}`),
  ];

  return lines.join("\n");
}

function resolvePdfFontPath() {
  if (cachedPdfFontPath !== null) {
    return cachedPdfFontPath;
  }

  cachedPdfFontPath = "";

  for (const candidate of PDF_FONT_CANDIDATES) {
    if (candidate && fs.existsSync(candidate)) {
      cachedPdfFontPath = candidate;
      break;
    }
  }

  return cachedPdfFontPath || null;
}

function renderSection(doc, title, lines) {
  doc.moveDown();
  doc.fontSize(15).fillColor("#9d4b27").text(title);
  doc.moveDown(0.35);
  doc.fontSize(11).fillColor("#2f241e");

  for (const line of lines) {
    doc.text(`• ${line}`, {
      lineGap: 2,
    });
  }
}

function buildPdfBuffer(book, sections) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 48,
      info: {
        Title: `Reader Diary - ${book.title}`,
        Author: book.author,
        Subject: "Exported reading notes and quotes",
      },
    });

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const fontPath = resolvePdfFontPath();
    if (fontPath) {
      doc.font(fontPath);
    }

    doc.fontSize(21).fillColor("#2f241e").text(book.title, {
      align: "left",
    });
    doc.moveDown(0.5);

    doc.fontSize(11).fillColor("#6c5a4f");
    for (const line of sections.meta) {
      doc.text(line);
    }

    renderSection(doc, "Сессии чтения", sections.sessionLines);
    renderSection(doc, "Заметки и цитаты", sections.noteLines);

    doc.end();
  });
}

export async function buildExportPayload(book, sessions, notes, format = "md") {
  const normalizedFormat = String(format || "md").toLowerCase();
  const sections = buildSections(book, sessions, notes);

  if (normalizedFormat === "json") {
    const names = buildFileNames(book, "json");
    return {
      fileName: names.asciiFileName,
      downloadName: names.utf8FileName,
      mimeType: "application/json; charset=utf-8",
      body: JSON.stringify({ book, sessions, notes }, null, 2),
    };
  }

  if (normalizedFormat === "txt") {
    const names = buildFileNames(book, "txt");
    return {
      fileName: names.asciiFileName,
      downloadName: names.utf8FileName,
      mimeType: "text/plain; charset=utf-8",
      body: buildTextBody(book, sections),
    };
  }

  if (normalizedFormat === "pdf") {
    const names = buildFileNames(book, "pdf");
    return {
      fileName: names.asciiFileName,
      downloadName: names.utf8FileName,
      mimeType: "application/pdf",
      body: await buildPdfBuffer(book, sections),
    };
  }

  if (normalizedFormat !== "md") {
    throw new Error(`Unsupported export format: ${normalizedFormat}`);
  }

  const names = buildFileNames(book, "md");
  return {
    fileName: names.asciiFileName,
    downloadName: names.utf8FileName,
    mimeType: "text/markdown; charset=utf-8",
    body: buildMarkdownBody(book, sections),
  };
}
