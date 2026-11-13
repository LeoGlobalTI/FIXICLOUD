import React, { useEffect, useState } from 'react';
import { ExternalLink, MessageCircle, X } from 'lucide-react';
import type { Branch, Client, CustomerAsset, Tenant, WorkOrder } from '../types/erp';
import { buildWhatsAppUrl, interpolateWhatsAppTemplate } from '../utils/erpLogic';

interface WhatsAppModalProps {
  order: WorkOrder;
  client?: Client;
  asset?: CustomerAsset;
  branch?: Branch;
  tenant: Tenant;
  onClose: () => void;
}

export const WhatsAppModal: React.FC<WhatsAppModalProps> = ({
  order,
  client,
  asset,
  branch,
  tenant,
  onClose,
}) => {
  const [templateType, setTemplateType] = useState<'intake' | 'quote_ready' | 'ready_for_pickup'>(
    order.status === 'ready'
      ? 'ready_for_pickup'
      : order.status === 'waiting_approval' || order.technical_diagnosis
      ? 'quote_ready'
      : 'intake'
  );

  const [phone, setPhone] = useState(client?.phone ?? '');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const raw = tenant.whatsapp_templates[templateType];
    setMessage(
      interpolateWhatsAppTemplate(raw, {
        order,
        client,
        asset,
        branch,
        tenant,
      })
    );
  }, [templateType, order, client, asset, branch, tenant]);

  const waUrl = buildWhatsAppUrl(phone, message);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A2463]/45 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wa-modal-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white border border-[#D8E4EC]/70 p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-[#D8E4EC]">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-[#1B998B]" />
            <h2 id="wa-modal-title" className="text-base font-semibold text-slate-900">
              Notificar por WhatsApp — {order.folio}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal de WhatsApp"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Plantilla de Mensaje
            </label>
            <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setTemplateType('intake')}
                className={`px-2 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  templateType === 'intake'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Ingreso
              </button>
              <button
                type="button"
                onClick={() => setTemplateType('quote_ready')}
                className={`px-2 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  templateType === 'quote_ready'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Presupuesto
              </button>
              <button
                type="button"
                onClick={() => setTemplateType('ready_for_pickup')}
                className={`px-2 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  templateType === 'ready_for_pickup'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Listo Retiro
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Teléfono Destino
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Previsualización Editable del Mensaje
            </label>
            <textarea
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-[11px] text-slate-500 font-mono break-all">
            {waUrl}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#D8E4EC]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[#D8E4EC] px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-[#F4F6FB]"
            >
              Cerrar
            </button>
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#1B998B] hover:bg-[#157A6E] px-4 py-2 text-xs font-semibold text-white transition-colors"
            >
              <span>Abrir en WhatsApp</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
