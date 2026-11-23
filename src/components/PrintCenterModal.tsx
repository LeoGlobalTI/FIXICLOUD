import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { FileText, Globe, Printer, X } from 'lucide-react';
import type {
  Branch,
  Client,
  CustomerAsset,
  LoanAsset,
  PaperFormat,
  ReportLanguage,
  ReportTemplateId,
  Tenant,
  WorkOrder,
} from '../types/erp';
import {
  SECTOR_LABELS,
  buildPublicTrackUrl,
  calculateOrderFinancials,
  formatCurrency,
} from '../utils/erpLogic';

interface PrintCenterModalProps {
  order: WorkOrder;
  tenant: Tenant;
  branch?: Branch;
  client?: Client;
  asset?: CustomerAsset;
  loanAssets: LoanAsset[];
  onClose: () => void;
}

const REPORT_LIST: Array<{
  id: ReportTemplateId;
  shortTitle: string;
  desc: string;
}> = [
  { id: 'Entrada.rpt', shortTitle: 'Entrada.rpt', desc: 'Orden de Entrada Taller' },
  { id: 'EntradaDom.rpt', shortTitle: 'EntradaDom.rpt', desc: 'Entrada Visita Domicilio' },
  { id: 'MiniTicket.rpt', shortTitle: 'MiniTicket.rpt', desc: 'Ticket Térmico + QR' },
  { id: 'Salida.rpt', shortTitle: 'Salida.rpt', desc: 'Salida Taller (Sin IVA)' },
  { id: 'SalidaDom.rpt', shortTitle: 'SalidaDom.rpt', desc: 'Salida Domicilio (Sin IVA)' },
  { id: 'SalIVA.rpt', shortTitle: 'SalIVA.rpt', desc: 'Salida Taller (Con IVA)' },
  { id: 'SalIVADom.rpt', shortTitle: 'SalIVADom.rpt', desc: 'Salida Domicilio (Con IVA)' },
  { id: 'Recibo.rpt', shortTitle: 'Recibo.rpt', desc: 'Recibo de Caja / Abono' },
  { id: 'Prestamo.rpt', shortTitle: 'Prestamo.rpt', desc: 'Acta Equipo en Préstamo' },
];

const DICT = {
  es: {
    workOrder: 'Orden de Trabajo',
    trackingCode: 'Código de Seguimiento',
    date: 'Fecha / Hora',
    branch: 'Sucursal',
    clientInfo: 'Datos del Cliente',
    name: 'Nombre / Razón Social',
    taxId: 'RUT / ID',
    phone: 'Teléfono',
    address: 'Dirección',
    equipmentInfo: 'Identificación del Equipo',
    category: 'Categoría',
    brandModel: 'Marca / Modelo',
    serial: 'N° Serie / IMEI',
    accessories: 'Accesorios Recibidos',
    entryCondition: 'Estado Físico Inicial',
    reportedSymptoms: 'Síntomas Reportados',
    technicalDiagnosis: 'Diagnóstico Técnico',
    workPerformed: 'Informe de Trabajo Realizado',
    partsAndObs: 'Repuestos / Observaciones',
    warranty: 'Garantía',
    days: 'días',
    visitBlock: 'Datos de Visita a Domicilio / Terreno',
    visitAddress: 'Dirección de Visita',
    scheduledAt: 'Fecha Programada',
    assignedTech: 'Técnico Asignado',
    itemDesc: 'Descripción',
    qty: 'Cant.',
    unitPrice: 'P. Unit',
    subtotal: 'Subtotal',
    discount: 'Descuento',
    netTotal: 'Subtotal Neto',
    tax: 'IVA',
    total: 'Total',
    paidAmount: 'Abonos Pagados',
    balanceDue: 'Saldo Pendiente',
    legalTitle: 'Términos y Condiciones del Servicio',
    legalBody:
      'El taller no se responsabiliza por pérdida de información no respaldada previamente. Todo equipo reparado cuenta con garantía limitada sobre la falla intervenida. Transcurridos 90 días desde el aviso de retiro sin respuesta, el taller podrá aplicar cargos de bodegaje.',
    customerSig: 'Firma Cliente',
    techSig: 'Firma Recepción / Técnico',
    qrInstructions:
      'Escanee el QR o ingrese su código en el portal web para ver el estado de su equipo',
    receiptTitle: 'Recibo de Caja / Comprobante de Abono',
    receiptNo: 'N° Recibo',
    paymentMethod: 'Método de Pago',
    reference: 'Referencia',
    amountReceived: 'Monto Recibido',
    loanTitle: 'Acta de Entrega de Equipo en Préstamo',
    loanCode: 'Código Préstamo',
    loanSerial: 'N° Serie Respaldo',
    loanCommercialValue: 'Valor Comercial de Responsabilidad',
    loanNotes: 'Accesorios y Condición de Entrega',
    loanCommitment:
      'El cliente recibe el equipo de respaldo en calidad de comodato temporal y se compromete a devolverlo en las mismas condiciones al momento de retirar su equipo reparado.',
    originalCopy: 'ORIGINAL — CLIENTE',
    workshopCopy: 'COPIA — TALLER',
    cutLine: '✂ CORTAR POR ESTA LÍNEA',
    noLoanAssigned: 'Esta orden no tiene un equipo de préstamo asignado actualmente.',
  },
  en: {
    workOrder: 'Work Order',
    trackingCode: 'Tracking Code',
    date: 'Date / Time',
    branch: 'Branch',
    clientInfo: 'Customer Information',
    name: 'Name / Company',
    taxId: 'Tax ID',
    phone: 'Phone',
    address: 'Address',
    equipmentInfo: 'Equipment Details',
    category: 'Category',
    brandModel: 'Brand / Model',
    serial: 'Serial / IMEI',
    accessories: 'Accessories Received',
    entryCondition: 'Initial Physical Condition',
    reportedSymptoms: 'Reported Symptoms',
    technicalDiagnosis: 'Technical Diagnosis',
    workPerformed: 'Work Performed Report',
    partsAndObs: 'Parts & Observations',
    warranty: 'Warranty',
    days: 'days',
    visitBlock: 'On-Site / Home Service Dispatch',
    visitAddress: 'Service Address',
    scheduledAt: 'Scheduled Date/Time',
    assignedTech: 'Assigned Technician',
    itemDesc: 'Description',
    qty: 'Qty',
    unitPrice: 'Unit Price',
    subtotal: 'Subtotal',
    discount: 'Discount',
    netTotal: 'Net Subtotal',
    tax: 'Tax / VAT',
    total: 'Total',
    paidAmount: 'Paid / Deposits',
    balanceDue: 'Balance Due',
    legalTitle: 'Service Terms & Conditions',
    legalBody:
      'The service center is not liable for data loss on storage media not backed up prior to intake. Repairs carry a limited warranty strictly on the serviced fault. Unclaimed equipment after 90 days from ready notification may incur storage fees.',
    customerSig: 'Customer Signature',
    techSig: 'Technician / Intake Signature',
    qrInstructions:
      'Scan the QR code or enter your tracking code on our web portal to check live repair status',
    receiptTitle: 'Cash Receipt / Deposit Voucher',
    receiptNo: 'Receipt #',
    paymentMethod: 'Payment Method',
    reference: 'Reference',
    amountReceived: 'Amount Received',
    loanTitle: 'Loaner Equipment Handover Agreement',
    loanCode: 'Loaner Code',
    loanSerial: 'Loaner Serial #',
    loanCommercialValue: 'Liability Commercial Value',
    loanNotes: 'Included Accessories & Condition',
    loanCommitment:
      'The customer receives the backup unit on temporary loan and agrees to return it in the same working condition upon pickup of the repaired device.',
    originalCopy: 'ORIGINAL — CUSTOMER',
    workshopCopy: 'COPY — WORKSHOP',
    cutLine: '✂ CUT ALONG THIS LINE',
    noLoanAssigned: 'This work order does not currently have a loaner unit assigned.',
  },
} as const;

export const PrintCenterModal: React.FC<PrintCenterModalProps> = ({
  order,
  tenant,
  branch,
  client,
  asset,
  loanAssets,
  onClose,
}) => {
  const defaultTemplate: ReportTemplateId =
    order.status === 'ready' || order.status === 'delivered'
      ? order.apply_iva
        ? order.modality === 'home_service'
          ? 'SalIVADom.rpt'
          : 'SalIVA.rpt'
        : order.modality === 'home_service'
        ? 'SalidaDom.rpt'
        : 'Salida.rpt'
      : order.modality === 'home_service'
      ? 'EntradaDom.rpt'
      : 'Entrada.rpt';

  const [template, setTemplate] = useState<ReportTemplateId>(defaultTemplate);
  const [paperFormat, setPaperFormat] = useState<PaperFormat>('letter');
  const [lang, setLang] = useState<ReportLanguage>('es');
  const [selectedPaymentId, setSelectedPaymentId] = useState<string>('ALL');
  const [qrSvg, setQrSvg] = useState<string>('');

  const t = DICT[lang];
  const isTaxForcedOn = template === 'SalIVA.rpt' || template === 'SalIVADom.rpt';
  const isTaxForcedOff = template === 'Salida.rpt' || template === 'SalidaDom.rpt';
  const templateIvaMismatch =
    (isTaxForcedOn && !order.apply_iva) || (isTaxForcedOff && order.apply_iva);

  const financials = calculateOrderFinancials(
    order.items,
    order.discount_amount,
    isTaxForcedOn ? true : isTaxForcedOff ? false : order.apply_iva,
    tenant.iva_rate,
    order.payments
  );

  const effectivePaper: PaperFormat =
    template === 'MiniTicket.rpt' ? 'thermal_80mm' : paperFormat;

  const warrantyDays = order.warranty_days ?? tenant.warranty_days ?? 90;
  const linkedLoanAsset = order.loan
    ? loanAssets.find((l) => l.id === order.loan?.loan_asset_id)
    : undefined;

  useEffect(() => {
    const trackUrl = buildPublicTrackUrl(order.tracking_code);
    QRCode.toString(trackUrl, {
      type: 'svg',
      margin: 1,
      width: 112,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((svg) => setQrSvg(svg))
      .catch(() => setQrSvg(''));
  }, [order.tracking_code]);

  const handleSelectTemplate = (id: ReportTemplateId) => {
    setTemplate(id);
    if (id === 'MiniTicket.rpt') {
      setPaperFormat('thermal_80mm');
    } else if (effectivePaper === 'thermal_80mm') {
      setPaperFormat('letter');
    }
  };

  const renderSingleDocument = (copyLabel?: string) => {
    const isThermal = effectivePaper === 'thermal_80mm' || template === 'MiniTicket.rpt';
    const isDom =
      template === 'EntradaDom.rpt' ||
      template === 'SalidaDom.rpt' ||
      template === 'SalIVADom.rpt';
    const isExit =
      template === 'Salida.rpt' ||
      template === 'SalidaDom.rpt' ||
      template === 'SalIVA.rpt' ||
      template === 'SalIVADom.rpt';
    const showTaxBreakdown =
      template === 'SalIVA.rpt' || template === 'SalIVADom.rpt';

    if (isThermal) {
      return (
        <div className="mx-auto max-w-[300px] bg-white text-black font-mono text-[11px] leading-snug p-4 border border-slate-300">
          <div className="text-center border-b border-dashed border-black pb-2.5">
            <div className="text-sm font-bold uppercase">{tenant.name}</div>
            <div>RUT: {tenant.tax_id}</div>
            {branch && (
              <>
                <div className="font-semibold">{branch.name}</div>
                <div>{branch.address}</div>
                <div>{branch.phone}</div>
              </>
            )}
          </div>

          <div className="py-2.5 text-center border-b border-dashed border-black">
            <div className="text-[10px] uppercase">{t.workOrder}</div>
            <div className="text-xl font-bold tracking-wider">{order.folio}</div>
            <div className="text-[10px]">
              {new Date(order.created_at).toLocaleString('es-CL')}
            </div>
          </div>

          <div className="py-2 border-b border-dashed border-black space-y-0.5">
            <div>
              <strong>{t.name}:</strong> {client?.name}
            </div>
            <div>
              <strong>{t.phone}:</strong> {client?.phone}
            </div>
            <div>
              <strong>{t.equipmentInfo}:</strong> {asset?.category} {asset?.brand}{' '}
              {asset?.model}
            </div>
            <div>
              <strong>{t.serial}:</strong> {asset?.serial_imei}
            </div>
          </div>

          <div className="py-2 border-b border-dashed border-black">
            <div className="font-bold uppercase">{t.reportedSymptoms}:</div>
            <div>{order.reported_symptoms}</div>
          </div>

          <div className="py-2 border-b border-dashed border-black space-y-0.5">
            <div className="flex justify-between">
              <span>{t.total}:</span>
              <span className="font-bold">
                {formatCurrency(financials.totalAmount, tenant.currency)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>{t.paidAmount}:</span>
              <span>{formatCurrency(financials.paidAmount, tenant.currency)}</span>
            </div>
            <div className="flex justify-between font-bold text-xs">
              <span>{t.balanceDue}:</span>
              <span>{formatCurrency(financials.balanceDue, tenant.currency)}</span>
            </div>
          </div>

          <div className="pt-3 text-center space-y-1.5">
            <div className="text-[10px] font-bold">
              {t.trackingCode}: {order.tracking_code}
            </div>
            {qrSvg && (
              <div
                className="mx-auto w-[112px] h-[112px] flex items-center justify-center"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            )}
            <div className="text-[10px] leading-tight">{t.qrInstructions}</div>
          </div>
        </div>
      );
    }

    // Standard Letter / Half-Page Document
    return (
      <div
        className={`bg-white text-slate-900 ${
          effectivePaper === 'half_duplicate' ? 'p-5 text-[11px]' : 'p-7 text-xs'
        } space-y-3.5`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b-2 border-slate-900 pb-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-extrabold tracking-tight text-slate-900">
                {tenant.name}
              </h3>
              {copyLabel && (
                <span className="border border-slate-800 px-1.5 py-0.5 font-mono text-[10px] font-bold">
                  {copyLabel}
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-600">
              RUT: <span className="font-mono">{tenant.tax_id}</span> ·{' '}
              {SECTOR_LABELS[tenant.sector]}
            </div>
            {branch && (
              <div className="text-[11px] text-slate-600">
                {branch.name} — {branch.address}, {branch.city} · Tel: {branch.phone}
              </div>
            )}
          </div>

          <div className="text-right shrink-0">
            <div className="font-mono text-[10px] font-bold text-blue-700 uppercase">
              {template}
            </div>
            <div className="font-mono text-2xl font-extrabold text-slate-900 leading-none mt-0.5">
              {order.folio}
            </div>
            <div className="font-mono text-[11px] text-slate-600 mt-1">
              {t.trackingCode}: <strong>{order.tracking_code}</strong>
            </div>
            <div className="text-[10px] text-slate-500">
              {new Date(order.created_at).toLocaleString('es-CL')}
            </div>
          </div>
        </div>

        {/* Receipt Mode */}
        {template === 'Recibo.rpt' && (
          <div className="space-y-4">
            <div className="text-center font-bold text-sm uppercase tracking-wide border-b border-slate-300 pb-2">
              {t.receiptTitle}
            </div>
            {(() => {
              const chosenPaymentIndex =
                selectedPaymentId === 'ALL'
                  ? -1
                  : order.payments.findIndex((p) => p.id === selectedPaymentId);
              const chosenPayment =
                chosenPaymentIndex >= 0 ? order.payments[chosenPaymentIndex] : null;
              const receiptAmt = chosenPayment
                ? chosenPayment.amount
                : financials.paidAmount;
              const receiptNumber = `REC-${order.folio.replace(/\D/g, '')}${
                chosenPaymentIndex >= 0 ? `-${chosenPaymentIndex + 1}` : ''
              }`;
              return (
                <div className="grid grid-cols-2 gap-4 border border-slate-300 rounded p-4">
                  <div className="space-y-0.5">
                    <div>
                      <strong>{t.receiptNo}:</strong>{' '}
                      <span className="font-mono">{receiptNumber}</span>
                    </div>
                    {chosenPayment?.date && (
                      <div>
                        <strong>{t.date}:</strong>{' '}
                        <span className="font-mono">{chosenPayment.date}</span>
                      </div>
                    )}
                    <div>
                      <strong>{t.name}:</strong> {client?.name || '—'}
                    </div>
                    <div>
                      <strong>{t.taxId}:</strong>{' '}
                      <span className="font-mono">{client?.rut || '—'}</span>
                    </div>
                    <div>
                      <strong>{t.equipmentInfo}:</strong> {asset?.brand} {asset?.model}
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <div>
                      <strong>{t.paymentMethod}:</strong>{' '}
                      {chosenPayment
                        ? chosenPayment.method === 'transfer'
                          ? 'Transferencia'
                          : chosenPayment.method === 'cash'
                          ? 'Efectivo'
                          : 'Tarjeta'
                        : 'Consolidado Abonos'}
                    </div>
                    {chosenPayment?.reference && (
                      <div>
                        <strong>{t.reference}:</strong>{' '}
                        <span className="font-mono">{chosenPayment.reference}</span>
                      </div>
                    )}
                    <div className="text-base font-bold font-mono pt-1">
                      {t.amountReceived}: {formatCurrency(receiptAmt, tenant.currency)}
                    </div>
                    <div className="font-mono text-slate-600">
                      {t.balanceDue}:{' '}
                      {formatCurrency(financials.balanceDue, tenant.currency)}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Loaner Agreement Mode */}
        {template === 'Prestamo.rpt' && (
          <div className="space-y-3">
            <div className="text-center font-bold text-sm uppercase tracking-wide border-b border-slate-300 pb-2">
              {t.loanTitle}
            </div>
            {!order.loan ? (
              <div className="border border-dashed border-slate-300 p-6 text-center text-slate-500">
                {t.noLoanAssigned}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 border border-slate-300 rounded p-3.5">
                  <div>
                    <div>
                      <strong>{t.name}:</strong> {client?.name}
                    </div>
                    <div>
                      <strong>{t.taxId}:</strong> {client?.rut}
                    </div>
                    <div>
                      <strong>{t.phone}:</strong> {client?.phone}
                    </div>
                  </div>
                  <div>
                    <div>
                      <strong>{t.loanCode}:</strong>{' '}
                      <span className="font-mono font-bold">{order.loan.asset_code}</span>
                    </div>
                    <div>
                      <strong>{t.brandModel}:</strong>{' '}
                      {linkedLoanAsset?.brand_model ?? order.loan.asset_name}
                    </div>
                    <div>
                      <strong>{t.loanSerial}:</strong>{' '}
                      <span className="font-mono">
                        {linkedLoanAsset?.serial_number ?? 'S/N'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="border border-slate-300 rounded p-3 space-y-1">
                  <div>
                    <strong>{t.loanNotes}:</strong> {order.loan.delivery_notes}
                  </div>
                  <div>
                    <strong>{t.loanCommercialValue}:</strong>{' '}
                    <span className="font-mono">
                      {lang === 'en'
                        ? 'Per current inventory & handover record'
                        : 'Según valor declarado en acta de entrega'}
                    </span>
                  </div>
                  <p className="pt-1 text-[11px] text-slate-700">{t.loanCommitment}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Standard Intake / Exit Modes */}
        {template !== 'Recibo.rpt' && template !== 'Prestamo.rpt' && (
          <>
            {/* Client & Equipment Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-slate-300 rounded p-3 space-y-1">
                <div className="font-bold text-slate-900 border-b border-slate-200 pb-1">
                  {t.clientInfo}
                </div>
                <div>
                  <strong>{t.name}:</strong> {client?.name}
                </div>
                <div>
                  <strong>{t.taxId}:</strong>{' '}
                  <span className="font-mono">{client?.rut}</span> ·{' '}
                  <strong>{t.phone}:</strong>{' '}
                  <span className="font-mono">{client?.phone}</span>
                </div>
                <div>
                  <strong>{t.address}:</strong> {client?.address}
                  {client?.city ? `, ${client.city}` : ''}
                </div>
              </div>

              <div className="border border-slate-300 rounded p-3 space-y-1">
                <div className="font-bold text-slate-900 border-b border-slate-200 pb-1">
                  {t.equipmentInfo}
                </div>
                <div>
                  <strong>{t.brandModel}:</strong> {asset?.category} {asset?.brand}{' '}
                  {asset?.model}
                </div>
                <div>
                  <strong>{t.serial}:</strong>{' '}
                  <span className="font-mono">{asset?.serial_imei || '—'}</span> ·{' '}
                  <strong>{t.assignedTech}:</strong> {order.assigned_technician || '—'}
                </div>
                <div>
                  <strong>{t.accessories}:</strong> {order.accessories_received}
                </div>
                {asset && Object.keys(asset.custom_attributes).length > 0 && (
                  <div className="text-[10px] text-slate-600">
                    {Object.entries(asset.custom_attributes)
                      .filter(([, v]) => Boolean(v))
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(' · ')}
                  </div>
                )}
              </div>
            </div>

            {isDom && (
              <div className="border border-cyan-400 bg-cyan-50/40 rounded p-2.5 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <strong>{t.visitBlock}:</strong>{' '}
                  {order.visit_address || client?.address || 'Dirección cliente'}
                </div>
                <div className="font-mono">
                  <strong>{t.scheduledAt}:</strong>{' '}
                  {order.visit_scheduled_at || 'Por confirmar'}
                </div>
              </div>
            )}

            {/* Symptoms / Diagnosis / Work Performed */}
            <div className="border border-slate-300 rounded p-3 space-y-1.5">
              {!isExit && (
                <div>
                  <strong>{t.entryCondition}:</strong> {order.entry_condition}
                </div>
              )}
              <div>
                <strong>{t.reportedSymptoms}:</strong> {order.reported_symptoms}
              </div>
              {isExit && (
                <>
                  <div>
                    <strong>{t.technicalDiagnosis}:</strong>{' '}
                    {order.technical_diagnosis || '—'}
                  </div>
                  <div>
                    <strong>{t.workPerformed}:</strong> {order.work_performed || '—'}
                  </div>
                  <div>
                    <strong>{t.partsAndObs}:</strong>{' '}
                    {order.parts_and_observations || '—'}
                  </div>
                  <div>
                    <strong>{t.warranty}:</strong>{' '}
                    <span className="font-mono">
                      {warrantyDays} {t.days}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Exit Items & Financials */}
            {isExit && (
              <div className="grid grid-cols-3 gap-3 items-start">
                <div className="col-span-2 border border-slate-300 rounded overflow-hidden">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-300 font-bold">
                        <th className="py-1.5 px-2">{t.itemDesc}</th>
                        <th className="py-1.5 px-2 text-right">{t.qty}</th>
                        <th className="py-1.5 px-2 text-right">{t.unitPrice}</th>
                        <th className="py-1.5 px-2 text-right">{t.subtotal}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {order.items.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-2 px-2 text-slate-500">
                            —
                          </td>
                        </tr>
                      ) : (
                        order.items.map((it) => (
                          <tr key={it.id}>
                            <td className="py-1 px-2">{it.description}</td>
                            <td className="py-1 px-2 text-right font-mono">{it.qty}</td>
                            <td className="py-1 px-2 text-right font-mono">
                              {formatCurrency(it.unit_price, tenant.currency)}
                            </td>
                            <td className="py-1 px-2 text-right font-mono font-semibold">
                              {formatCurrency(it.qty * it.unit_price, tenant.currency)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="border border-slate-300 rounded p-2.5 space-y-1 text-[11px]">
                  {showTaxBreakdown ? (
                    <>
                      <div className="flex justify-between">
                        <span>{t.netTotal}:</span>
                        <span className="font-mono">
                          {formatCurrency(financials.subtotal, tenant.currency)}
                        </span>
                      </div>
                      {financials.discount > 0 && (
                        <div className="flex justify-between">
                          <span>{t.discount}:</span>
                          <span className="font-mono">
                            -{formatCurrency(financials.discount, tenant.currency)}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>
                          {t.tax} ({tenant.iva_rate}%):
                        </span>
                        <span className="font-mono">
                          {formatCurrency(financials.ivaAmount, tenant.currency)}
                        </span>
                      </div>
                    </>
                  ) : null}
                  <div className="flex justify-between font-bold border-t border-slate-200 pt-1">
                    <span>{t.total}:</span>
                    <span className="font-mono">
                      {formatCurrency(financials.totalAmount, tenant.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t.paidAmount}:</span>
                    <span className="font-mono">
                      -{formatCurrency(financials.paidAmount, tenant.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-xs border-t border-slate-300 pt-1">
                    <span>{t.balanceDue}:</span>
                    <span className="font-mono">
                      {formatCurrency(financials.balanceDue, tenant.currency)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Legal Terms + QR on Intake */}
            <div className="flex items-center justify-between gap-4 border-t border-slate-300 pt-2.5 text-[10px] text-slate-600">
              <div className="flex-1">
                <div className="font-bold text-slate-800">{t.legalTitle}</div>
                <p>{tenant.legal_terms || t.legalBody}</p>
              </div>
              {qrSvg && effectivePaper !== 'half_duplicate' && (
                <div className="text-center shrink-0">
                  <div
                    className="w-[68px] h-[68px] mx-auto [&>svg]:w-full [&>svg]:h-full"
                    dangerouslySetInnerHTML={{ __html: qrSvg }}
                  />
                  <div className="font-mono text-[9px] font-bold">
                    {order.tracking_code}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-10 pt-6">
          <div className="border-t border-slate-800 pt-1 text-center text-[11px] font-semibold">
            {t.customerSig}
          </div>
          <div className="border-t border-slate-800 pt-1 text-center text-[11px] font-semibold">
            {t.techSig}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      id="fixicloud-print-portal"
      className="fixed inset-0 z-50 flex flex-col bg-[#0A2463]/55 backdrop-blur-[2px] p-3 lg:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="print-center-title"
    >
      <div className="max-w-6xl w-full mx-auto rounded-2xl bg-white border border-[#D8E4EC] shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">
        {/* Modal Control Header (Hidden on Print) */}
        <div className="no-print bg-[#0A2463] text-white px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-white/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-[#3E92CC]" />
            </div>
            <div>
              <h2 id="print-center-title" className="text-sm font-semibold">
                Centro de Impresión FIXICLOUD — {order.folio}
              </h2>
              <p className="text-xs text-slate-300">
                9 reportes oficiales de FIXICLOUD · QR dinámico · Doble Media Hoja · ES/EN
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* ES/EN Toggle */}
            <div className="flex items-center gap-1 bg-[#1E3A8A] p-1 rounded-xl">
              <Globe className="h-3.5 w-3.5 text-sky-300 ml-1.5" />
              <button
                type="button"
                onClick={() => setLang('es')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                  lang === 'es' ? 'bg-[#3E92CC] text-white' : 'text-slate-200 hover:text-white'
                }`}
              >
                ES
              </button>
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                  lang === 'en' ? 'bg-[#3E92CC] text-white' : 'text-slate-200 hover:text-white'
                }`}
              >
                EN
              </button>
            </div>

            {/* Paper Format */}
            <select
              aria-label="Formato de papel"
              value={effectivePaper}
              disabled={template === 'MiniTicket.rpt'}
              onChange={(e) => setPaperFormat(e.target.value as PaperFormat)}
              className="rounded-xl bg-[#1E3A8A] border border-white/15 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
            >
              <option value="letter">Carta / A4 (Hoja Completa)</option>
              <option value="half_duplicate">Media Hoja Duplicado (2 en 1)</option>
              <option value="thermal_80mm">Rollo Térmico 80mm</option>
            </select>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#3E92CC] hover:bg-[#3178A8] text-white px-4 py-1.5 text-xs font-semibold transition-colors"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Imprimir</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar centro de impresión"
              className="rounded-xl p-1.5 text-slate-200 hover:bg-white/10 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 9 Report Tabs (Hidden on Print) */}
        <div className="no-print bg-[#F4F6FB] border-b border-[#D8E4EC] px-4 py-3 flex flex-wrap gap-2">
          {REPORT_LIST.map((rep) => (
            <button
              key={rep.id}
              type="button"
              onClick={() => handleSelectTemplate(rep.id)}
              className={`px-3 py-1.5 rounded-xl text-left border transition-colors ${
                template === rep.id
                  ? 'bg-[#3E92CC] border-[#3E92CC] text-white shadow-sm'
                  : 'bg-white border-[#D8E4EC] text-slate-700 hover:border-[#3E92CC]'
              }`}
            >
              <div className="font-mono text-[11px] font-bold leading-tight">
                {rep.shortTitle}
              </div>
              <div
                className={`text-[10px] leading-tight ${
                  template === rep.id ? 'text-sky-100' : 'text-slate-500'
                }`}
              >
                {rep.desc}
              </div>
            </button>
          ))}
        </div>

        {templateIvaMismatch && (
          <div className="no-print bg-amber-50 border-b border-amber-200 px-5 py-2 text-xs text-amber-800 font-medium">
            {isTaxForcedOn
              ? `Nota: La orden ${order.folio} está configurada sin IVA, pero la plantilla ${template} desglosa e incluye IVA (${tenant.iva_rate}%).`
              : `Nota: La orden ${order.folio} incluye IVA (${tenant.iva_rate}%), pero la plantilla ${template} omite el desglose de IVA.`}
          </div>
        )}

        {template === 'Recibo.rpt' && order.payments.length > 0 && (
          <div className="no-print bg-[#EBF4FA] border-b border-[#D8E4EC] px-5 py-2.5 flex items-center gap-3 text-xs">
            <span className="font-semibold text-[#0A2463]">
              Seleccionar pago para Recibo.rpt:
            </span>
            <select
              value={selectedPaymentId}
              onChange={(e) => setSelectedPaymentId(e.target.value)}
              className="rounded-xl border border-[#D8E4EC] bg-white px-2.5 py-1 text-xs font-mono text-slate-800"
            >
              <option value="ALL">
                Total Abonado ({formatCurrency(financials.paidAmount, tenant.currency)})
              </option>
              {order.payments.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.date} · {formatCurrency(p.amount, tenant.currency)} ({p.method})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Print Preview Surface */}
        <div className="flex-1 overflow-y-auto bg-[#EBF0F7] p-4 lg:p-8">
          <div
            id="fixicloud-print-sheet"
            className={`mx-auto bg-white shadow-lg border border-[#D8E4EC] ${
              effectivePaper === 'thermal_80mm' ? 'max-w-[320px] p-2' : 'max-w-[820px]'
            }`}
          >
            {effectivePaper === 'half_duplicate' ? (
              <div>
                {renderSingleDocument(t.originalCopy)}
                <div className="border-t-2 border-dashed border-slate-400 my-1 py-1 text-center font-mono text-[10px] text-slate-500">
                  {t.cutLine}
                </div>
                {renderSingleDocument(t.workshopCopy)}
              </div>
            ) : (
              renderSingleDocument()
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
