import React from 'react';
import { cn } from '@/lib/utils';

type MetricTone = 'green' | 'orange' | 'purple' | 'red';

interface MetricCardProps {
  title: string;
  value: string | number;
  description: string;
  icon: string;
  tone?: MetricTone;
  change?: number | null;
  sparkData?: number[];
  className?: string;
}

const toneConfig: Record<MetricTone, { iconBg: string; iconColor: string }> = {
  green: { iconBg: 'bg-[#ECFDF5]', iconColor: 'text-[#059669]' },
  orange: { iconBg: 'bg-[#FFF7ED]', iconColor: 'text-[#EA580C]' },
  purple: { iconBg: 'bg-[#F5F3FF]', iconColor: 'text-[#7C3AED]' },
  red: { iconBg: 'bg-[#FEF2F2]', iconColor: 'text-[#DC2626]' },
};

export function MetricCard({
  title,
  value,
  description,
  icon,
  tone = 'green',
  change,
  sparkData,
  className,
}: MetricCardProps) {
  const config = toneConfig[tone];
  const [mounted, setMounted] = React.useState(false);
  const [displayValue, setDisplayValue] = React.useState<string | number>(typeof value === 'number' ? 0 : value);

  React.useEffect(() => {
    setMounted(true);
    // count-up animation for numeric values
    if (typeof value === 'number') {
      let start = 0;
      const duration = 700;
      const startTime = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - startTime) / duration);
        const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // easeInOutQuad
        const current = Math.round(start + (value - start) * eased);
        setDisplayValue(current);
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    return () => {};
  }, [value]);

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-xl border border-[#E2E8F0] bg-white px-3 py-3 shadow-sm transform transition-all duration-200',
        mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
        'hover:shadow-md hover:-translate-y-0.5',
        className
      )}
      style={{ willChange: 'transform, opacity' }}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[12px] font-medium leading-snug text-[#64748B]">{title}</span>
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', config.iconBg)}>
          <span className={cn('material-symbols-outlined text-[16px]', config.iconColor)}>{icon}</span>
        </span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[20px] font-bold leading-none tracking-tight text-[#1E293B]">{displayValue}</span>
        {typeof change === 'number' && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
              change >= 0 ? 'bg-[#ECFDF5] text-[#059669]' : 'bg-[#FEF2F2] text-[#DC2626]'
            )}
          >
            <span className="material-symbols-outlined text-[13px]">
              {change >= 0 ? 'arrow_upward' : 'arrow_downward'}
            </span>
            {Math.abs(change)}%
          </span>
        )}
      </div>
      <p className="text-xs leading-relaxed text-[#94A3B8]">{description}</p>

      {sparkData && sparkData.length > 1 && (
        <div className="mt-2 h-5 w-full">
          <svg viewBox="0 0 100 12" preserveAspectRatio="none" className="w-full h-5">
            {(() => {
              const max = Math.max(...sparkData);
              const min = Math.min(...sparkData);
              const range = Math.max(1, max - min);
              const pts = sparkData.map((v, i) => {
                const x = (i / (sparkData.length - 1)) * 100;
                // scale 0-12 px
                const y = 12 - ((v - min) / range) * 10 - 1;
                return `${x},${y.toFixed(2)}`;
              });
              return <polyline points={pts.join(' ')} fill="none" stroke="#1A73E8" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="opacity-90" />;
            })()}
          </svg>
        </div>
      )}
    </div>
  );
}