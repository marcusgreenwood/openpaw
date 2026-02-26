"use client";

import { useRef, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AreaChart,
  BarChart,
  LineChart,
  DonutChart,
} from "@tremor/react";

const TREMOR_COLORS = ["cyan", "violet", "emerald", "amber", "rose", "blue", "indigo"];

interface ChartJsConfig {
  type: string;
  data: { labels?: unknown[]; datasets: { label: string; data: number[] }[] };
}

/** Convert Chart.js format to Tremor format for bar/line/area charts */
function toTremorSeries(config: ChartJsConfig): {
  data: Record<string, string | number>[];
  index: string;
  categories: string[];
} | null {
  const { data } = config;
  const labels = data?.labels as string[] | undefined;
  const datasets = data?.datasets;
  if (!labels?.length || !datasets?.length) return null;

  const indexKey = "label";
  const tremorData = labels.map((label, i) => {
    const row: Record<string, string | number> = { [indexKey]: label };
    datasets.forEach((ds) => {
      row[ds.label] = ds.data[i] ?? 0;
    });
    return row;
  });
  return {
    data: tremorData,
    index: indexKey,
    categories: datasets.map((d) => d.label),
  };
}

/** Convert Chart.js format to Tremor DonutChart format */
function toTremorDonut(config: ChartJsConfig): {
  data: { name: string; value: number }[];
} | null {
  const { data } = config;
  const labels = data?.labels as string[] | undefined;
  const datasets = data?.datasets;
  if (!labels?.length || !datasets?.length) return null;

  const values = datasets[0].data;
  return {
    data: labels.map((name, i) => ({ name, value: values[i] ?? 0 })),
  };
}

function parseChartConfig(content: string): ChartJsConfig | null {
  try {
    const decoded = content
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
    const parsed = JSON.parse(decoded) as Record<string, unknown>;
    const type = parsed?.type as string;
    const data = parsed?.data as ChartJsConfig["data"];
    if (!type || !data?.labels || !Array.isArray(data.datasets)) return null;
    const validTypes = ["bar", "line", "area", "pie", "doughnut"];
    if (!validTypes.includes(type)) return null;
    return { type, data };
  } catch {
    return null;
  }
}

/**
 * Props for the HtmlWithCharts component.
 *
 * @property html - Sanitized HTML string to render via `dangerouslySetInnerHTML`
 * @property chartConfigs - Serialized Chart.js config strings extracted before sanitization;
 *   referenced by index via `data-chart-index` attributes in the HTML
 * @property rawHtml - Original unsanitized HTML shown in the collapsible "View HTML" section
 * @property className - Extra CSS classes applied to the chart container div
 */
interface HtmlWithChartsProps {
  html: string;
  chartConfigs?: string[];
  rawHtml?: string;
  className?: string;
}

/**
 * Renders sanitized HTML and mounts Tremor charts on elements with data-chart-type
 * and data-chart-index (configs passed separately to avoid DOMPurify altering long attributes).
 */
export function HtmlWithCharts({ html, chartConfigs = [], rawHtml, className }: HtmlWithChartsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showHtml, setShowHtml] = useState(false);
  const rootsRef = useRef<ReturnType<typeof createRoot>[]>([]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    rootsRef.current.forEach((r) => r.unmount());
    rootsRef.current = [];

    const initChart = (chartEl: HTMLElement) => {
      const type = chartEl.getAttribute("data-chart-type");
      const indexStr = chartEl.getAttribute("data-chart-index");
      const dataStr = chartEl.getAttribute("data-chart-data");
      const configStr =
        indexStr !== null && chartConfigs[parseInt(indexStr, 10)] !== undefined
          ? chartConfigs[parseInt(indexStr, 10)]
          : dataStr;
      if (!type || !configStr) return;

      const config = parseChartConfig(configStr);
      if (!config) return;

      const colors = TREMOR_COLORS.slice(0, config.data.datasets.length);

      if (type === "pie" || type === "doughnut") {
        const donutData = toTremorDonut(config);
        if (!donutData) return;

        const root = createRoot(chartEl);
        rootsRef.current.push(root);
        root.render(
          <div className="h-48 w-full">
            <DonutChart
              data={donutData.data}
              category="name"
              index="value"
              variant={type === "pie" ? "pie" : "donut"}
              colors={colors}
              showLabel
            />
          </div>
        );
      } else {
        const series = toTremorSeries(config);
        if (!series) return;

        const ChartComponent =
          type === "bar" ? BarChart : type === "area" ? AreaChart : LineChart;

        const root = createRoot(chartEl);
        rootsRef.current.push(root);
        root.render(
          <div className="h-48 w-full">
            <ChartComponent
              data={series.data}
              index={series.index}
              categories={series.categories}
              colors={colors}
            />
          </div>
        );
      }
    };

    const runInit = () => {
      const chartElements = el.querySelectorAll<HTMLElement>("[data-chart-type]");
      chartElements.forEach((chartEl) => {
        if (chartEl.querySelector("[data-tremor-mounted]")) return;
        chartEl.setAttribute("data-tremor-mounted", "true");
        chartEl.innerHTML = "";
        initChart(chartEl);
      });
    };

    const rafId = requestAnimationFrame(() => {
      requestAnimationFrame(runInit);
    });
    const timeoutId = setTimeout(runInit, 300);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
      rootsRef.current.forEach((r) => r.unmount());
      rootsRef.current = [];
    };
  }, [html, chartConfigs]);

  const displayHtml = rawHtml ?? html;

  return (
    <div>
      <div
        ref={containerRef}
        className={`${className ?? ""} [&_.tremor-BarChart]:text-white [&_.tremor-AreaChart]:text-white [&_.tremor-LineChart]:text-white [&_.tremor-DonutChart]:text-white`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <button
        type="button"
        onClick={() => setShowHtml((v) => !v)}
        className="mt-2 text-xs text-text-muted hover:text-text-secondary transition-colors flex items-center gap-1.5"
      >
        <span className="opacity-70">{showHtml ? "▼" : "▶"}</span>
        {showHtml ? "Hide HTML" : "View HTML"}
      </button>
      {showHtml && (
        <pre className="mt-2 p-4 rounded-lg bg-bg-elevated border border-white/10 text-xs text-text-code overflow-x-auto max-h-80 overflow-y-auto font-mono whitespace-pre-wrap break-all">
          <code>{displayHtml}</code>
        </pre>
      )}
    </div>
  );
}
