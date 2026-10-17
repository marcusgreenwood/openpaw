/**
 * Build the URL for a file in workspace/public.
 * Use this when displaying or linking to files saved by the agent.
 * @param filePath - File path relative to workspace/public (e.g. "screenshot.png" or "screenshots/2024.png")
 * @param workspacePath - Optional workspace root, passed as the `workspace` query param
 * @returns `/api/files/<encoded path>`, with each path segment URI-encoded
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
