"use client";

import DOMPurify from "isomorphic-dompurify";
import { Markdown } from "./Markdown";
import { HtmlWithCharts } from "./HtmlWithCharts";

type ContentSegment = { type: "markdown"; content: string } | { type: "html"; content: string };

/** Extract chart configs from raw HTML before sanitization (DOMPurify may alter long attribute values). */
function extractChartConfigs(html: string): { html: string; configs: string[] } {
  const configs: string[] = [];
  const decode = (s: string) =>
    s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  // Prefer single-quoted: data-chart-data='{"labels":[...]}' (JSON uses double quotes)
  const modified = html.replace(
    /\s+data-chart-data\s*=\s*'([^']*)'/g,
    (_, content) => {
      configs.push(decode(content));
      return ` data-chart-index="${configs.length - 1}"`;
    }
  ).replace(
    // Double-quoted: value may use &quot; for embedded quotes
    /\s+data-chart-data\s*=\s*"((?:[^"&]|&[^;]*;)*)"/g,
    (_, content) => {
      configs.push(decode(content));
      return ` data-chart-index="${configs.length - 1}"`;
    }
  );
  return { html: modified, configs };
}

/**
 * Parse assistant text into segments of markdown and HTML.
 */
function parseContent(text: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  let remaining = text;
  const htmlStartTag = "<!--html-->";
  const htmlEndTag = "<!--/html-->";

  while (remaining.length > 0) {
    const startIdx = remaining.search(new RegExp(htmlStartTag, "i"));
    if (startIdx === -1) {
      if (remaining.trim()) {
        segments.push({ type: "markdown", content: remaining });
      }
      break;
    }

    if (startIdx > 0) {
      const before = remaining.slice(0, startIdx);
      if (before.trim()) {
        segments.push({ type: "markdown", content: before });
      }
    }

    remaining = remaining.slice(startIdx + htmlStartTag.length);
    const endIdx = remaining.search(new RegExp(htmlEndTag, "i"));
    if (endIdx === -1) {
      if (remaining.trim()) {
        segments.push({ type: "html", content: remaining.trim() });
      }
      break;
    }

    const content = remaining.slice(0, endIdx).trim();
    if (content) {
      segments.push({ type: "html", content });
    }
    remaining = remaining.slice(endIdx + htmlEndTag.length);
  }

  return segments;
}

/**
 * Sanitize HTML for safe rendering. Allows Tailwind classes and common layout tags.
 */
function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["target", "rel"],
    ALLOWED_ATTR: [
      "class",
      "id",
      "href",
      "src",
      "alt",
      "title",
      "target",
      "rel",
      "style",
      "width",
      "height",
      "type",
      "placeholder",
      "value",
      "disabled",
      "aria-label",
      "role",
      "data-chart-type",
      "data-chart-data",
      "data-chart-index",
    ],
  });
}

/**
 * Props for the AssistantContent component.
 *
 * @property children - Raw assistant message text (may contain Markdown and/or HTML blocks)
 * @property className - Extra classes applied to the outer wrapper div
 */
interface AssistantContentProps {
  children: string;
  className?: string;
}

/**
 * Renders assistant message content, supporting interleaved Markdown and
 * Tailwind HTML blocks. HTML sections are delimited by `<!--html-->…<!--/html-->`.
 * Chart configs are extracted before DOMPurify sanitization to preserve large
 * JSON attribute values, then re-injected via numeric `data-chart-index` refs.
 */
export function AssistantContent({ children, className }: AssistantContentProps) {
  const segments = parseContent(children);

  if (segments.length === 0) return null;
  if (segments.length === 1 && segments[0].type === "markdown") {
    return (
      <div className={className}>
        <Markdown>{segments[0].content}</Markdown>
      </div>
    );
  }

  return (
    <div className={className}>
      {segments.map((seg, i) =>
        seg.type === "markdown" ? (
          <Markdown key={i}>{seg.content}</Markdown>
        ) : (() => {
            const { html: extractedHtml, configs } = extractChartConfigs(seg.content);
            return (
              <HtmlWithCharts
                key={i}
                html={sanitizeHtml(extractedHtml)}
                chartConfigs={configs}
                rawHtml={seg.content}
                className="tailwind-html my-2 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
              />
            );
          })()
      )}
    </div>
  );
}
