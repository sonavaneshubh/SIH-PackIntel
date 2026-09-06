'use client';

import React from 'react';

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  total: number;
  centerValue?: string | number;
  centerLabel?: string;
  size?: number;
  thickness?: number;
  className?: string;
}

/**
 * Accessible SVG donut chart with a labelled centre.
 * Renders real segment arcs from the supplied values; empty state when total === 0.
 */
export function DonutChart({
  segments,
  total,
  centerValue,
  centerLabel,
  size = 132,
  thickness = 14,
  className,
}: DonutChartProps) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const hasData = total > 0;

  let cumulative = 0;
  const arcs = segments.map((segment) => {
    const fraction = hasData ? segment.value / total : 0;
    const start = cumulative;
    cumulative += fraction;
    return { ...segment, start, fraction };
  });

  return (
    <div
      className={`relative inline-flex ${className ?? ''}`}
      role="img"
      aria-label={centerLabel ? `${centerLabel}: ${total}` : `Total ${total}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E1E3E4"
          strokeWidth={thickness}
        />
        {hasData &&
          arcs.map(
            (segment) =>
              segment.fraction > 0 && (
                <circle
                  key={segment.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth={thickness}
                  strokeDasharray={`${segment.fraction * circumference} ${circumference}`}
                  strokeDashoffset={-segment.start * circumference}
                />
              )
          )}
      </svg>
      <div
        className="absolute flex flex-col items-center justify-center"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <span className="text-[22px] font-bold leading-none text-on-surface">
          {centerValue ?? total}
        </span>
        {centerLabel && (
          <span className="mt-1 text-[10px] font-label-bold uppercase tracking-wider text-on-surface-variant">
            {centerLabel}
          </span>
        )}
      </div>
    </div>
  );
}