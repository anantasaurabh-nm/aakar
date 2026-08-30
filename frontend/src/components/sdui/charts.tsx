'use client';

import type { ChartSeries } from '@erp/shared-contracts';

const PALETTE = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#06b6d4', '#8b5cf6'];

export function DonutChart({ series }: { series: ChartSeries[] }) {
  const values = series.map((s) => s.points.reduce((sum, p) => sum + p.y, 0));
  const total = values.reduce((a, b) => a + b, 0);
  if (total === 0) {
    return <EmptyChart label="No data" />;
  }

  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
      <svg width={160} height={160} viewBox="0 0 160 160">
        <g transform="translate(80,80) rotate(-90)">
          {values.map((value, i) => {
            const fraction = value / total;
            const length = fraction * circumference;
            const dasharray = `${length} ${circumference - length}`;
            const dashoffset = -offset;
            offset += length;
            return (
              <circle
                key={series[i]!.id}
                r={radius}
                fill="transparent"
                stroke={PALETTE[i % PALETTE.length]}
                strokeWidth={22}
                strokeDasharray={dasharray}
                strokeDashoffset={dashoffset}
              />
            );
          })}
        </g>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {series.map((s, i) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: PALETTE[i % PALETTE.length] }} />
            <span style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AreaChart({ series }: { series: ChartSeries[] }) {
  const allPoints = series.flatMap((s) => s.points);
  if (allPoints.length === 0) return <EmptyChart label="No data" />;

  const width = 480;
  const height = 200;
  const padding = 28;
  const maxY = Math.max(1, ...allPoints.map((p) => p.y));
  const maxLen = Math.max(...series.map((s) => s.points.length), 1);

  const toXY = (index: number, y: number) => {
    const x = padding + (index / Math.max(maxLen - 1, 1)) * (width - padding * 2);
    const yPos = height - padding - (y / maxY) * (height - padding * 2);
    return [x, yPos] as const;
  };

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="var(--border)" />
      {series.map((s, sIndex) => {
        const points = s.points.map((p, i) => toXY(i, p.y));
        const linePath = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
        const areaPath =
          sIndex === 0
            ? `${linePath} L${points[points.length - 1]?.[0]},${height - padding} L${points[0]?.[0]},${height - padding} Z`
            : null;
        const color = PALETTE[sIndex % PALETTE.length];
        return (
          <g key={s.id}>
            {areaPath && <path d={areaPath} fill={color} opacity={0.15} />}
            <path d={linePath} fill="none" stroke={color} strokeWidth={2.5} />
          </g>
        );
      })}
    </svg>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
      {label}
    </div>
  );
}
