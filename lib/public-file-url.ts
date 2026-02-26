/**
 * Builds the URL for a file in `<workspace>/public/`, served by `/api/files/`.
 * Each path segment is percent-encoded to handle spaces and special characters.
 * Use this whenever displaying or linking to files saved by the agent.
 *
 * @param filePath - Path relative to `workspace/public/` (e.g. "screenshot.png" or "reports/2024.pdf")
 * @param workspacePath - Optional workspace root override; appended as a `?workspace=` query param
 * @returns Absolute-path URL that the browser can fetch via `/api/files/[...path]`
 */
export function getPublicFileUrl(filePath: string, workspacePath?: string): string {
  const encodedPath = filePath
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
  const base = `/api/files/${encodedPath}`;
  if (workspacePath) {
    return `${base}?workspace=${encodeURIComponent(workspacePath)}`;
  }
  return base;
}
