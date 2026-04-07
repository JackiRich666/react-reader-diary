export const API_URL = import.meta.env.VITE_API_URL || "/api";

function parseFileNameFromHeader(contentDisposition) {
  if (!contentDisposition) {
    return "";
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch (error) {
      return utf8Match[1];
    }
  }

  const quotedMatch = contentDisposition.match(/filename="([^"]+)"/i);
  if (quotedMatch) {
    return quotedMatch[1];
  }

  const plainMatch = contentDisposition.match(/filename=([^;]+)/i);
  return plainMatch ? plainMatch[1].trim() : "";
}

export async function apiRequest(path, options = {}) {
  const { method = "GET", token, body, responseType = "json" } = options;

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let message = "Ошибка запроса.";

    try {
      const errorData = await response.json();
      message = errorData.message || message;
    } catch (error) {
      message = response.statusText || message;
    }

    throw new Error(message);
  }

  if (responseType === "blob") {
    return {
      blob: await response.blob(),
      fileName: parseFileNameFromHeader(response.headers.get("content-disposition")),
      contentType: response.headers.get("content-type") || "",
    };
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}
