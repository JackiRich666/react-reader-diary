import { useEffect, useState } from "react";
import { apiRequest } from "../api/http";

const PREVIEW_FORMATS = [
  { id: "md", label: "Markdown", hint: "Удобно для редактирования и копирования" },
  { id: "json", label: "JSON", hint: "Структурированный вариант для интеграций" },
  { id: "pdf", label: "PDF", hint: "Готовый документ для чтения и сохранения" },
];

function downloadBlob(blob, fileName) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.URL.revokeObjectURL(url);
}

export function ExportPreviewModal({ book, token, isOpen, onClose, onError }) {
  const [activeFormat, setActiveFormat] = useState("md");
  const [previewState, setPreviewState] = useState({
    status: "idle",
    text: "",
    fileName: "",
    objectUrl: "",
    error: "",
  });

  useEffect(() => {
    if (!isOpen || !book) {
      return;
    }

    setActiveFormat("md");
  }, [isOpen, book?.userBookId]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !book) {
      return;
    }

    let cancelled = false;
    let objectUrl = "";

    async function loadPreview() {
      setPreviewState({
        status: "loading",
        text: "",
        fileName: "",
        objectUrl: "",
        error: "",
      });

      try {
        const asset = await apiRequest(`/library/books/${book.userBookId}/export?format=${activeFormat}`, {
          token,
          responseType: "blob",
        });

        let text = "";
        if (activeFormat === "pdf") {
          objectUrl = window.URL.createObjectURL(asset.blob);
        } else {
          text = await asset.blob.text();
        }

        if (cancelled) {
          if (objectUrl) {
            window.URL.revokeObjectURL(objectUrl);
          }
          return;
        }

        setPreviewState({
          status: "ready",
          text,
          fileName: asset.fileName || `book-export.${activeFormat}`,
          objectUrl,
          error: "",
        });
      } catch (error) {
        if (objectUrl) {
          window.URL.revokeObjectURL(objectUrl);
        }

        if (!cancelled) {
          const message = error.message || "Не удалось подготовить предпросмотр.";
          setPreviewState({
            status: "error",
            text: "",
            fileName: "",
            objectUrl: "",
            error: message,
          });
          onError?.(message);
        }
      }
    }

    loadPreview();

    return () => {
      cancelled = true;
      if (objectUrl) {
        window.URL.revokeObjectURL(objectUrl);
      }
    };
  }, [activeFormat, isOpen, book?.userBookId, token, onError]);

  if (!isOpen || !book) {
    return null;
  }

  const activeFormatMeta = PREVIEW_FORMATS.find((item) => item.id === activeFormat);

  const handleDownload = async () => {
    try {
      const asset = await apiRequest(`/library/books/${book.userBookId}/export?format=${activeFormat}`, {
        token,
        responseType: "blob",
      });
      downloadBlob(asset.blob, asset.fileName || `book-export.${activeFormat}`);
    } catch (error) {
      onError?.(error.message || "Не удалось скачать файл.");
    }
  };

  return (
    <div className="preview-overlay" onClick={onClose}>
      <section className="preview-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="preview-header">
          <div className="preview-title-block">
            <span className="eyebrow">Export Preview</span>
            <h2>{book.title}</h2>
            <p>
              {book.author} • {book.currentPage}/{book.totalPages} стр.
            </p>
          </div>
          <button className="ghost-button" type="button" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <div className="preview-toolbar">
          <div className="preview-tabs">
            {PREVIEW_FORMATS.map((format) => (
              <button
                key={format.id}
                type="button"
                className={activeFormat === format.id ? "toggle-chip active" : "toggle-chip"}
                onClick={() => setActiveFormat(format.id)}
              >
                {format.label}
              </button>
            ))}
          </div>

          <div className="preview-actions">
            <span className="preview-hint">{activeFormatMeta?.hint}</span>
            <button
              className="primary-button"
              type="button"
              onClick={handleDownload}
              disabled={previewState.status === "loading"}
            >
              Скачать {activeFormat.toUpperCase()}
            </button>
          </div>
        </div>

        <div className="preview-body">
          {previewState.status === "loading" ? (
            <div className="preview-placeholder">Готовим предпросмотр...</div>
          ) : null}

          {previewState.status === "error" ? <div className="form-error">{previewState.error}</div> : null}

          {previewState.status === "ready" && activeFormat !== "pdf" ? (
            <>
              <div className="preview-file-meta">{previewState.fileName}</div>
              <pre className="preview-code">{previewState.text}</pre>
            </>
          ) : null}

          {previewState.status === "ready" && activeFormat === "pdf" ? (
            <>
              <div className="preview-file-meta">{previewState.fileName}</div>
              <iframe className="preview-frame" src={previewState.objectUrl} title={`preview-${book.userBookId}`} />
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
