"use client";

import {
  AreaChart,
  BarChart,
  LineChart,
  DonutChart,
} from "@tremor/react";

const TREMOR_COLORS = ["cyan", "violet", "emerald", "amber", "rose", "blue", "indigo"];

/** Chart config from the agent (Chart.js-compatible format for consistency). */
export interface ChartConfig {
  type: "bar" | "line" | "area" | "pie" | "doughnut";
  data: {
    labels?: string[];
    datasets: { label: string; data: number[] }[];
  };
}

function toTremorSeries(config: ChartConfig) {
  const { data } = config;
  const labels = data?.labels ?? [];
  const datasets = data?.datasets ?? [];
  if (!labels.length || !datasets.length) return null;

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

function toTremorDonut(config: ChartConfig) {
  const { data } = config;
  const labels = data?.labels ?? [];
  const datasets = data?.datasets ?? [];
  if (!labels.length || !datasets.length) return null;
  const values = datasets[0].data;
  return {
    data: labels.map((name, i) => ({ name, value: values[i] ?? 0 })),
  };
}

/**
 * Props for the ChartWidget component.
 *
 * @property config - Chart.js-compatible chart configuration
 * @property className - Optional extra CSS classes applied to the wrapper div
 */
interface ChartWidgetProps {
  config: ChartConfig;
  className?: string;
}

/**
 * Renders a data chart using Tremor components. Accepts a Chart.js-compatible
 * `ChartConfig` and renders the appropriate Tremor chart type:
 *   - `bar` → BarChart, `line` → LineChart, `area` → AreaChart
 *   - `pie` / `doughnut` → DonutChart
 *
 * Returns null if the chart data cannot be converted (e.g. empty labels/datasets).
 */
export function ChartWidget({ config, className }: ChartWidgetProps) {
  const colors = TREMOR_COLORS.slice(0, config.data.datasets.length);

  if (config.type === "pie" || config.type === "doughnut") {
    const donutData = toTremorDonut(config);
    if (!donutData) return null;
    return (
      <div className={`w-full min-h-[200px] ${className ?? ""}`}>
        <DonutChart
          data={donutData.data}
          category="name"
          index="value"
          variant={config.type === "pie" ? "pie" : "donut"}
          colors={colors}
          showLabel
        />
      </div>
    );
  }

  const series = toTremorSeries(config);
  if (!series) return null;

  const ChartComponent =
    config.type === "bar" ? BarChart : config.type === "area" ? AreaChart : LineChart;

  return (
    <div className={`w-full min-h-[200px] ${className ?? ""}`}>
      <ChartComponent
        data={series.data}
        index={series.index}
        categories={series.categories}
        colors={colors}
      />
    </div>
  );
}
