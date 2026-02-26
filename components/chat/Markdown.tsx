"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

/**
 * Props for the Markdown component.
 *
 * @property children - Raw Markdown string to render
 */
interface MarkdownProps {
  children: string;
}

const components: Components = {
  // Code blocks & inline code
  pre({ children }) {
    return (
      <pre className="terminal-block my-3 overflow-x-auto text-[13px]">
        {children}
      </pre>
    );
  },
  code({ className, children, ...props }) {
    const isBlock = className?.startsWith("language-");
    if (isBlock) {
      return (
        <code className="text-text-code" {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="px-1.5 py-0.5 rounded bg-white/[0.08] text-text-code text-[13px] font-mono"
        {...props}
      >
        {children}
      </code>
    );
  },

  // Headings
  h1({ children }) {
    return <h1 className="text-lg font-semibold text-text-primary mt-4 mb-2">{children}</h1>;
  },
  h2({ children }) {
    return <h2 className="text-base font-semibold text-text-primary mt-3 mb-1.5">{children}</h2>;
  },
  h3({ children }) {
    return <h3 className="text-sm font-semibold text-text-primary mt-2 mb-1">{children}</h3>;
  },

  // Paragraphs
  p({ children }) {
    return <p className="mb-2 last:mb-0">{children}</p>;
  },

  // Lists
  ul({ children }) {
    return <ul className="list-disc list-outside ml-4 mb-2 space-y-0.5">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="list-decimal list-outside ml-4 mb-2 space-y-0.5">{children}</ol>;
  },
  li({ children }) {
    return <li className="text-text-primary">{children}</li>;
  },

  // Blockquote
  blockquote({ children }) {
    return (
      <blockquote className="border-l-2 border-accent-cyan/40 pl-3 my-2 text-text-secondary italic">
        {children}
      </blockquote>
    );
  },

  // Links
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent-cyan hover:text-accent-cyan/80 underline underline-offset-2 decoration-accent-cyan/30"
      >
        {children}
      </a>
    );
  },

  // Table
  table({ children }) {
    return (
      <div className="overflow-x-auto my-2 rounded-lg border border-white/[0.06]">
        <table className="w-full text-sm">{children}</table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="bg-white/[0.04] text-text-secondary">{children}</thead>;
  },
  th({ children }) {
    return <th className="px-3 py-1.5 text-left text-xs font-medium">{children}</th>;
  },
  td({ children }) {
    return <td className="px-3 py-1.5 border-t border-white/[0.04]">{children}</td>;
  },

  // Horizontal rule
  hr() {
    return <hr className="border-white/[0.08] my-3" />;
  },

  // Strong / emphasis
  strong({ children }) {
    return <strong className="font-semibold text-text-primary">{children}</strong>;
  },
  em({ children }) {
    return <em className="italic text-text-secondary">{children}</em>;
  },
};

/**
 * Renders a Markdown string using `react-markdown` with GitHub Flavored Markdown
 * support (remark-gfm). All standard elements (headings, lists, tables, code
 * blocks, links) are mapped to dark-themed Tailwind-styled components.
 */
export function Markdown({ children }: MarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={components}
    >
      {children}
    </ReactMarkdown>
  );
}
