import React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export type AlertBannerVariant = 'success' | 'info' | 'error';

interface AlertBannerProps {
  variant: AlertBannerVariant;
  title?: string;
  message: string;
  onDismiss?: () => void;
  action?: React.ReactNode;
  className?: string;
}

const VARIANT_STYLES: Record<
  AlertBannerVariant,
  {
    container: string;
    iconBg: string;
    iconColor: string;
    titleColor: string;
    textColor: string;
  }
> = {
  success: {
    container: 'bg-[#EBF8F6] border-[#1B998B]/30',
    iconBg: 'bg-[#1B998B] text-white',
    iconColor: 'text-[#1B998B]',
    titleColor: 'text-[#0F5C53]',
    textColor: 'text-[#156E64]',
  },
  info: {
    container: 'bg-[#EBF4FA] border-[#3E92CC]/30',
    iconBg: 'bg-[#3E92CC] text-white',
    iconColor: 'text-[#3E92CC]',
    titleColor: 'text-[#0A2463]',
    textColor: 'text-[#1E4F7A]',
  },
  error: {
    container: 'bg-[#FDEDED] border-[#D64545]/30',
    iconBg: 'bg-[#D64545] text-white',
    iconColor: 'text-[#D64545]',
    titleColor: 'text-[#8F2424]',
    textColor: 'text-[#A62D2D]',
  },
};

export const AlertBanner: React.FC<AlertBannerProps> = ({
  variant,
  title,
  message,
  onDismiss,
  action,
  className = '',
}) => {
  const styles = VARIANT_STYLES[variant];
  const Icon =
    variant === 'success'
      ? CheckCircle2
      : variant === 'info'
      ? Info
      : AlertCircle;

  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 ${styles.container} ${className}`}
    >
      <div className="flex items-start gap-3 min-w-0">
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${styles.iconBg}`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 pt-0.5">
          {title && (
            <div className={`text-xs font-semibold ${styles.titleColor}`}>
              {title}
            </div>
          )}
          <div className={`text-xs leading-relaxed ${styles.textColor}`}>
            {message}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {action}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Cerrar alerta"
            className="rounded-lg p-1 text-slate-500 hover:bg-white/60 hover:text-slate-800"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
