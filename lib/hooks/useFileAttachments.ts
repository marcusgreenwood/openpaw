"use client";

import { useState, useCallback } from "react";

export interface FileAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  content: string; // text content or base64 data URL for images
}

const TEXT_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "py", "md", "json", "txt", "css", "html",
  "svg", "sh", "yaml", "yml", "toml", "xml", "sql", "rs", "go", "java",
  "rb", "php", "c", "cpp", "h", "hpp", "swift", "kt", "lua", "r",
]);

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);

const MAX_TEXT_SIZE = 100 * 1024; // 100KB
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

function getExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

function isImageFile(name: string, type: string): boolean {
  return type.startsWith("image/") || IMAGE_EXTENSIONS.has(getExtension(name));
}

function isTextFile(name: string, type: string): boolean {
  if (type.startsWith("text/") || type === "application/json") return true;
  return TEXT_EXTENSIONS.has(getExtension(name));
}

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

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsText(file);
  });
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export interface FileAttachmentError {
  name: string;
  reason: string;
}

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
