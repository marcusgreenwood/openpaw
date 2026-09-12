/**
 * Hook backing the chat input's file attachments.
 *
 * Files are read entirely in the browser and folded into the outgoing message as text —
 * nothing is uploaded to the server and no attachment is persisted between sessions.
 */

"use client";

import { useState, useCallback } from "react";

/** A file the user attached, already read into memory. */
export interface FileAttachment {
  /** Generated client-side id, used as the React key and for removal. */
  id: string;
  /** Original filename, including extension. */
  name: string;
  /** Either `"image"` or `"text"` — the resolved kind, not the browser MIME type. */
  type: string;
  /** Size in bytes, as reported by the File object. */
  size: number;
  /** UTF-8 text for text files, or a base64 data URL for images. */
  content: string;
}

/** Extensions treated as text when the browser reports no usable MIME type. */
const TEXT_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "py", "md", "json", "txt", "css", "html",
  "svg", "sh", "yaml", "yml", "toml", "xml", "sql", "rs", "go", "java",
  "rb", "php", "c", "cpp", "h", "hpp", "swift", "kt", "lua", "r",
]);

/** Extensions treated as images when the browser reports no usable MIME type. */
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);

/** Text files above this size are rejected. */
const MAX_TEXT_SIZE = 100 * 1024; // 100KB
/** Images above this size are rejected. */
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

/** Returns the lowercased extension without its dot, or `""` if the name has none. */
function getExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

/** True if the MIME type is an image type, or the extension is a known image extension. */
function isImageFile(name: string, type: string): boolean {
  return type.startsWith("image/") || IMAGE_EXTENSIONS.has(getExtension(name));
}

/** True if the MIME type is textual or JSON, or the extension is a known text extension. */
function isTextFile(name: string, type: string): boolean {
  if (type.startsWith("text/") || type === "application/json") return true;
  return TEXT_EXTENSIONS.has(getExtension(name));
}

/** Maps a file extension to a markdown code-fence language, falling back to the extension. */
function langFromExtension(ext: string): string {
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
    py: "python", md: "markdown", json: "json", css: "css",
    html: "html", svg: "svg", sh: "bash", yaml: "yaml", yml: "yaml",
    toml: "toml", xml: "xml", sql: "sql", rs: "rust", go: "go",
    java: "java", rb: "ruby", php: "php", c: "c", cpp: "cpp",
    h: "c", hpp: "cpp", swift: "swift", kt: "kotlin", lua: "lua",
    r: "r", txt: "text",
  };
  return map[ext] || ext || "text";
}

/** Promise wrapper around FileReader.readAsText. Rejects if the read fails. */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsText(file);
  });
}

/** Promise wrapper around FileReader.readAsDataURL, yielding a base64 data URL. */
function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/** A file that could not be attached, and why. */
export interface FileAttachmentError {
  /** The rejected file's name. */
  name: string;
  /** Human-readable reason, e.g. `"Image exceeds 5MB limit"`. */
  reason: string;
}

/**
 * Manages the set of files attached to the next chat message.
 *
 * Files are classified as image or text by MIME type with an extension fallback; anything
 * else, or anything over the size limit, is rejected into `errors` while the remaining
 * files in the same drop still attach.
 *
 * @returns
 * - `files` — the accepted attachments
 * - `errors` — rejections from the most recent {@link addFiles} call, replaced (not
 *   appended to) each time files are added
 * - `clearErrors` — dismisses the current errors
 * - `addFiles` — reads and adds a `FileList`, e.g. from a drop or file input
 * - `removeFile` — removes one attachment by id
 * - `clearFiles` — drops all attachments, typically after a message is sent
 * - `formatForMessage` — renders the attachments as markdown to append to the message
 *   body; returns `""` when nothing is attached
 */
export function useFileAttachments() {
  const [files, setFiles] = useState<FileAttachment[]>([]);
  const [errors, setErrors] = useState<FileAttachmentError[]>([]);

  const clearErrors = useCallback(() => setErrors([]), []);

  const addFiles = useCallback(async (fileList: FileList) => {
    const newFiles: FileAttachment[] = [];
    const newErrors: FileAttachmentError[] = [];

    const promises = Array.from(fileList).map(async (file) => {
      const isImage = isImageFile(file.name, file.type);
      const isText = isTextFile(file.name, file.type);

      if (!isImage && !isText) {
        newErrors.push({ name: file.name, reason: "Unsupported file type" });
        return;
      }

      if (isImage && file.size > MAX_IMAGE_SIZE) {
        newErrors.push({ name: file.name, reason: "Image exceeds 5MB limit" });
        return;
      }

      if (isText && file.size > MAX_TEXT_SIZE) {
        newErrors.push({ name: file.name, reason: "Text file exceeds 100KB limit" });
        return;
      }

      try {
        const content = isImage
          ? await readFileAsDataURL(file)
          : await readFileAsText(file);

        newFiles.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          name: file.name,
          type: isImage ? "image" : "text",
          size: file.size,
          content,
        });
      } catch {
        newErrors.push({ name: file.name, reason: "Failed to read file" });
      }
    });

    await Promise.all(promises);

    if (newFiles.length > 0) {
      setFiles((prev) => [...prev, ...newFiles]);
    }
    if (newErrors.length > 0) {
      setErrors(newErrors);
    }
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
  }, []);

  const formatForMessage = useCallback((): string => {
    if (files.length === 0) return "";

    const parts = files.map((f) => {
      if (f.type === "image") {
        return `[Attached image: ${f.name} (base64)]\n${f.content}`;
      }
      const ext = getExtension(f.name);
      const lang = langFromExtension(ext);
      return `[Attached file: ${f.name}]\n\`\`\`${lang}\n${f.content}\n\`\`\``;
    });

    return parts.join("\n\n");
  }, [files]);

  return {
    files,
    errors,
    clearErrors,
    addFiles,
    removeFile,
    clearFiles,
    formatForMessage,
  };
}
