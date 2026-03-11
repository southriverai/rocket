// Charts: burn duration (s) vs altitude and ascent velocity

import React, { useEffect, useRef, useCallback, useState } from 'react';
import uPlot, { type AlignedData, type Options, type Series } from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useStore } from '../../state/store';
import { getTotalBurnDuration, getTotalDeltaV } from '../../sim/rocket';
import { DEFAULT_SIM_PARAMS } from '../../sim/simTypes';
import type { TelemetrySample } from '../../sim/simTypes';

const G = DEFAULT_SIM_PARAMS.gravity;

/** Cumulative gravity loss (m/s) and friction loss (m/s) at each sample index.
 *  Gravity loss = g × t (linear accumulation over ascent time; standard definition).
 *  Friction loss = ∫ (F_drag/m) dt over time. */
function computeCumulativeLosses(telemetry: TelemetrySample[]): { gravityLoss: number[]; frictionLoss: number[] } {
  const gravityLoss: number[] = [];
  const frictionLoss: number[] = [];
  let fCum = 0;
  for (let i = 0; i < telemetry.length; i++) {
    // Gravity loss accumulates linearly: g × t (m/s)
    const gCum = G * telemetry[i].t;
    if (i > 0) {
      const dt = telemetry[i].t - telemetry[i - 1].t;
      const m = telemetry[i - 1].mass;
      const friction = telemetry[i - 1].friction ?? 0;
      if (m > 0) fCum += (friction / m) * dt;
    }
    gravityLoss.push(gCum);
    frictionLoss.push(fCum);
  }
  return { gravityLoss, frictionLoss };
}

const CURSOR_SYNC_KEY = 'rocket-charts';

type MetricKey = keyof Omit<TelemetrySample, 't'>;

const METRICS: { key: MetricKey; label: string; unit: string; format: (n: number) => string }[] = [
  { key: 'altitude', label: 'Altitude', unit: 'm', format: (n) => n.toFixed(0) },
  { key: 'speed', label: 'Speed', unit: 'm/s', format: (n) => n.toFixed(1) },
  { key: 'verticalSpeed', label: 'Vertical speed', unit: 'm/s', format: (n) => n.toFixed(1) },
  { key: 'acceleration', label: 'Acceleration', unit: 'm/s²', format: (n) => n.toFixed(1) },
  { key: 'friction', label: 'Friction (drag)', unit: 'N', format: (n) => n.toFixed(0) },
  { key: 'mass', label: 'Mass', unit: 'kg', format: (n) => n.toFixed(1) },
  { key: 'thrust', label: 'Thrust', unit: 'N', format: (n) => n.toFixed(0) },
  { key: 'twr', label: 'TWR', unit: '', format: (n) => n.toFixed(2) },
  { key: 'airDensity', label: 'Air density', unit: 'kg/m³', format: (n) => n.toFixed(4) },
];

const DEFAULT_VISIBLE_CHARTS: Record<string, boolean> = {
  altitude: true,
  verticalSpeed: true,
  speed: false,
  acceleration: false,
  friction: false,
  mass: false,
  thrust: false,
  twr: false,
  airDensity: false,
};

/** Format x-axis ticks as seconds (plain numbers), not time of day */
function secondsAxisValues(_u: uPlot, splits: number[]): string[] {
  return splits.map((v) => String(Math.round(v)));
}

/** Nearest index in time array to value x */
function nearestTimeIndex(time: number[], x: number): number {
  if (time.length === 0) return 0;
  let best = 0;
  let bestDist = Math.abs(time[0] - x);
  for (let i = 1; i < time.length; i++) {
    const d = Math.abs(time[i] - x);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function buildChartOptions(
  width: number,
  xMax: number,
  yLabel: string,
  seriesConfig: Series[],
  onCursorMove?: (xVal: number) => void
): Options {
  return {
    width,
    height: 280,
    series: [{}, ...seriesConfig],
    scales: {
      x: { min: 0, max: xMax },
    },
    axes: [
      { values: secondsAxisValues },
      { label: yLabel, side: 1 },
    ],
    cursor: {
      show: true,
      sync: { key: CURSOR_SYNC_KEY },
      points: { show: true, size: 8, width: 2 },
    },
    legend: { show: false },
    hooks: {
      setCursor: [
        (_u: uPlot, left: number | null) => {
          if (typeof left === 'number') onCursorMove?.(left);
        },
      ],
    },
  };
}

const CHART_COLORS = ['#1f77b4', '#2ca02c', '#d62728', '#ff7f0e', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22'];

export function ChartsPanel() {
  const { telemetry, currentDesign } = useStore();
  const chartContainerRef = useRef<Record<string, HTMLDivElement | null>>({});
  const plotRefs = useRef<Record<string, uPlot | null>>({});
  const timeRef = useRef<number[]>([]);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [visibleCharts, setVisibleCharts] = useState<Record<string, boolean>>(() => ({ ...DEFAULT_VISIBLE_CHARTS }));

  const totalBurnDuration = currentDesign ? getTotalBurnDuration(currentDesign) : 100;

  const onCursorMove = useCallback((xVal: number) => {
    const time = timeRef.current;
    if (time.length === 0) return;
    const idx = nearestTimeIndex(time, xVal);
    setHoveredIndex(idx);
  }, []);

  const toggleChart = useCallback((key: string) => {
    setVisibleCharts((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  useEffect(() => {
    const time: number[] = [];
    const seriesByMetric: Record<string, number[]> = {};
    METRICS.forEach((m) => { seriesByMetric[m.key] = []; });

    telemetry.forEach((s) => {
      time.push(s.t);
      METRICS.forEach((m) => seriesByMetric[m.key].push(Number((s as TelemetrySample)[m.key] ?? 0)));
    });

    if (time.length === 0) {
      time.push(0);
      METRICS.forEach((m) => seriesByMetric[m.key].push(0));
    }
    timeRef.current = time;

    const baseMax = Math.max(1, totalBurnDuration);
    const maxTime = time.length > 0 ? Math.max(...time) : 0;
    const xMax = maxTime > 0.75 * baseMax ? maxTime / 0.75 : baseMax;

    Object.values(plotRefs.current).forEach((u) => { u?.destroy(); });
    plotRefs.current = {};

    const visible = METRICS.filter((m) => visibleCharts[m.key]);
    visible.forEach((metric, i) => {
      const div = chartContainerRef.current[metric.key];
      if (!div) return;
      const yData = seriesByMetric[metric.key];
      const data: AlignedData = [time, yData];
      const yLabel = metric.unit ? `${metric.label} (${metric.unit})` : metric.label;
      const color = CHART_COLORS[i % CHART_COLORS.length];
      const opts = buildChartOptions(
        div.offsetWidth,
        xMax,
        yLabel,
        [{ label: yLabel, stroke: color, width: 2 }],
        onCursorMove
      );
      const u = new uPlot(opts, data, div);
      plotRefs.current[metric.key] = u;
    });

    return () => {
      Object.values(plotRefs.current).forEach((u) => { u?.destroy(); });
      plotRefs.current = {};
    };
  }, [telemetry, totalBurnDuration, onCursorMove, visibleCharts]);

  const displayIndex = hoveredIndex != null ? hoveredIndex : (telemetry.length > 0 ? telemetry.length - 1 : null);
  const selectedSample: TelemetrySample | null =
    displayIndex != null && telemetry[displayIndex] != null ? telemetry[displayIndex] : null;
  const isHovering = hoveredIndex != null;

  const totalDeltaV = currentDesign ? getTotalDeltaV(currentDesign) : 0;
  const { gravityLoss, frictionLoss } =
    telemetry.length > 0 ? computeCumulativeLosses(telemetry) : { gravityLoss: [] as number[], frictionLoss: [] as number[] };
  const maxAltIdx =
    telemetry.length > 0 ? telemetry.reduce((best, s, i) => (s.altitude > telemetry[best].altitude ? i : best), 0) : 0;

  const flightSummary =
    telemetry.length > 0
      ? {
          maxAltitude: Math.max(...telemetry.map((s) => s.altitude)),
          maxVelocity: Math.max(...telemetry.map((s) => s.speed)),
          flightDuration: Math.max(...telemetry.map((s) => s.t)),
          maxFriction: Math.max(...telemetry.map((s) => s.friction ?? 0)),
          totalDeltaV,
          ascentLosses: {
            gravityLoss: gravityLoss[maxAltIdx] ?? 0,
            frictionLoss: frictionLoss[maxAltIdx] ?? 0,
          },
        }
      : null;

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'row', gap: '1rem', minHeight: 0, flex: 1 }}>
      <div
        style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        {METRICS.filter((m) => visibleCharts[m.key]).map((metric) => (
          <div key={metric.key}>
            <h2 style={{ marginBottom: '0.5rem' }}>{metric.label}</h2>
            <div
              ref={(el) => {
                chartContainerRef.current[metric.key] = el;
              }}
              style={{ width: '100%' }}
            />
          </div>
        ))}
      </div>
      <div
        style={{
          width: 340,
          flexShrink: 0,
          padding: '0.75rem',
          backgroundColor: '#f8f9fa',
          borderRadius: 8,
          border: '1px solid #dee2e6',
          alignSelf: 'flex-start',
        }}
      >
        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem' }}>Flight summary</h3>
        {flightSummary != null ? (
          <div style={{ fontSize: '0.85rem', marginBottom: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid #dee2e6' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.2rem 0.75rem' }}>
              <span style={{ color: '#666' }}>Max altitude</span>
              <span>{flightSummary.maxAltitude.toFixed(0)} m</span>
              <span style={{ color: '#666' }}>Max velocity</span>
              <span>{flightSummary.maxVelocity.toFixed(1)} m/s</span>
              <span style={{ color: '#666' }}>Flight duration</span>
              <span>{flightSummary.flightDuration.toFixed(1)} s</span>
              <span style={{ color: '#666' }}>Max friction</span>
              <span>{flightSummary.maxFriction.toFixed(0)} N</span>
              <span style={{ color: '#666' }}>Total Δv (design)</span>
              <span>{flightSummary.totalDeltaV.toFixed(0)} m/s</span>
            </div>
            <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #eee' }}>
              <div style={{ fontWeight: 600, color: '#555', marginBottom: '0.25rem' }}>Ascent losses</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.2rem 0.75rem' }}>
                <span style={{ color: '#666' }}>Gravity loss</span>
                <span>{flightSummary.ascentLosses.gravityLoss.toFixed(0)} m/s ({totalDeltaV > 0 ? ((flightSummary.ascentLosses.gravityLoss / totalDeltaV) * 100).toFixed(1) : '0'}%)</span>
                <span style={{ color: '#666' }}>Friction loss</span>
                <span>{flightSummary.ascentLosses.frictionLoss.toFixed(0)} m/s ({totalDeltaV > 0 ? ((flightSummary.ascentLosses.frictionLoss / totalDeltaV) * 100).toFixed(1) : '0'}%)</span>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '0.85rem', color: '#666' }}>
            <p style={{ margin: '0 0 0.5rem 0' }}>No flight data yet.</p>
            {currentDesign && (
              <p style={{ margin: 0 }}>
                Total Δv (design): {getTotalDeltaV(currentDesign).toFixed(0)} m/s
              </p>
            )}
          </div>
        )}
        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem' }}>
          {isHovering ? 'At cursor' : 'Final state'}
        </h3>
        {selectedSample != null ? (
          <div style={{ fontSize: '0.85rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '0.25rem 0.5rem 0.25rem', alignItems: 'center' }}>
              <span style={{ color: '#666' }}>Timestep</span>
              <span>{selectedSample.dt != null ? `${selectedSample.dt.toFixed(3)} s` : '—'}</span>
              <span />
              <span style={{ color: '#666' }}>Sim instability</span>
              <span>{selectedSample.simInstability != null ? (selectedSample.simInstability * 100).toFixed(2) + '%' : '—'}</span>
              <span />
              <span style={{ color: '#666' }}>Time</span>
              <span>{selectedSample.t.toFixed(2)} s</span>
              <span />
              {METRICS.map((metric) => {
                const val = Number(selectedSample[metric.key] ?? 0);
                const pct = selectedSample.pctChangePerStep?.[metric.key];
                return (
                  <React.Fragment key={metric.key}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#666' }}>
                      <input
                        type="checkbox"
                        checked={!!visibleCharts[metric.key]}
                        onChange={() => toggleChart(metric.key)}
                        title="Show chart"
                      />
                      {metric.label}
                    </label>
                    <span>{metric.format(val)}{metric.unit ? ` ${metric.unit}` : ''}</span>
                    <span style={{ color: '#666', fontSize: '0.8rem' }}>
                      {pct != null ? `${(pct * 100).toFixed(2)}%/step` : '—'}
                    </span>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>
            No data. Launch from Design to see telemetry.
          </p>
        )}
      </div>
    </div>
  );
}
