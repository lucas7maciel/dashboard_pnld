import React, { createContext, forwardRef, useContext, useId, useMemo } from "react";
import { Legend, ResponsiveContainer, Tooltip } from "recharts";

const ChartContext = createContext({});

const useChart = () => useContext(ChartContext);

export function ChartContainer({ className = "", config = {}, children }) {
  const chartId = useId().replace(/:/g, "");
  const style = useMemo(() => {
    const variables = {};

    Object.entries(config).forEach(([key, value]) => {
      if (value?.color) {
        variables[`--color-${key}`] = value.color;
      }
    });

    return variables;
  }, [config]);

  return (
    <ChartContext.Provider value={config}>
      <div data-chart={chartId} className={`chart-container${className ? ` ${className}` : ""}`} style={style}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

export const ChartTooltip = Tooltip;
export const ChartLegend = Legend;

export const ChartTooltipContent = forwardRef(function ChartTooltipContent(
  { active, payload, label, hideLabel = false, labelFormatter, valueFormatter },
  ref,
) {
  const config = useChart();

  if (!active || !payload?.length) return null;

  const items = payload.filter((item) => item.value !== null && item.value !== undefined);
  if (!items.length) return null;

  return (
    <div ref={ref} className="chart-tooltip">
      {!hideLabel ? (
        <div className="chart-tooltip-label">
          {labelFormatter ? labelFormatter(label, items) : label}
        </div>
      ) : null}

      <div className="chart-tooltip-body">
        {items.map((item, index) => {
          const configKey = item.dataKey || item.name || item.payload?.name;
          const meta = config[configKey] || {};
          const color = item.color || item.payload?.fill || meta.color || "currentColor";
          const itemLabel = meta.label || item.name || item.payload?.name || configKey;
          const formattedValue = valueFormatter ? valueFormatter(item.value, item) : item.value;

          return (
            <div key={`${configKey}-${index}`} className="chart-tooltip-row">
              <span className="chart-tooltip-dot" style={{ backgroundColor: color }} />
              <span className="chart-tooltip-name">{itemLabel}</span>
              <span className="chart-tooltip-value">{formattedValue}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export function ChartLegendContent({ payload }) {
  const config = useChart();

  if (!payload?.length) return null;

  return (
    <div className="chart-legend">
      {payload.map((item, index) => {
        const configKey = item.dataKey || item.value;
        const meta = config[configKey] || {};
        const color = item.color || meta.color || `var(--color-${configKey})`;
        const label = meta.label || item.value;

        return (
          <div key={`${configKey}-${index}`} className="chart-legend-item">
            <span className="chart-legend-dot" style={{ backgroundColor: color }} />
            <span>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
