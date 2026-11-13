import React from 'react';
import { Check } from 'lucide-react';

interface ConfirmSuccessModalProps {
  title: string;
  description: string;
  secondaryLabel?: string;
  primaryLabel: string;
  onSecondary: () => void;
  onPrimary: () => void;
}

export const ConfirmSuccessModal: React.FC<ConfirmSuccessModalProps> = ({
  title,
  description,
  secondaryLabel = 'Cerrar',
  primaryLabel,
  onSecondary,
  onPrimary,
}) => {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0A2463]/40 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-success-title"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white border border-[#D8E4EC]/70 p-8 shadow-xl text-center space-y-5">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#EBF8F6] ring-8 ring-[#EBF8F6]/60">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1B998B] text-white">
            <Check className="h-5 w-5 stroke-[2.5]" />
          </div>
        </div>

        <div className="space-y-2">
          <h2
            id="confirm-success-title"
            className="text-xl font-semibold text-slate-900"
          >
            {title}
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            {description}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            onClick={onSecondary}
            className="rounded-xl bg-[#F4F6FB] hover:bg-[#D8E4EC]/60 border border-[#D8E4EC] px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors"
          >
            {secondaryLabel}
          </button>
          <button
            type="button"
            onClick={onPrimary}
            className="rounded-xl bg-[#1B998B] hover:bg-[#157A6E] px-4 py-2.5 text-sm font-semibold text-white transition-colors"
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
