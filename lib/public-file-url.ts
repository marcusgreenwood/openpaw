/**
 * Build the URL for a file in workspace/public.
 * Use this when displaying or linking to files saved by the agent.
 * @param path - File path relative to workspace/public (e.g. "screenshot.png" or "screenshots/2024.png")
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
