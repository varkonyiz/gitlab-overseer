/** File-level storage: everything the app keeps beyond the browser is a file the user downloads or opens. */

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export class FileTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`File is larger than ${maxBytes} bytes.`);
  }
}

/** Offers `content` as a file download. */
export function downloadFile(fileName: string, content: string | Blob, mimeType: string): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // Revoke after the click has been dispatched; the download keeps its own reference.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** Reads a user-selected file as UTF-8 text, refusing files above `maxBytes`. */
export async function readTextFile(file: File, maxBytes = MAX_IMPORT_BYTES): Promise<string> {
  if (file.size > maxBytes) {
    throw new FileTooLargeError(maxBytes);
  }
  return file.text();
}

/** `name-2026-10-26.ext` in local time, for downloaded files. */
export function datedFileName(base: string, extension: string, now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `${base}-${date}.${extension}`;
}
