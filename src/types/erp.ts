export type IndustrySector =
  | 'computing'
  | 'mobile'
  | 'machinery'
  | 'appliances'
  | 'automotive'
  | 'general';

export type RoleType = 'superadmin' | 'admin' | 'receptionist' | 'technician';

export type OrderStatus =
  | 'received'
  | 'diagnosing'
  | 'waiting_approval'
  | 'in_repair'
  | 'ready'
  | 'delivered';

export type ServiceModality = 'workshop' | 'home_service';

export type PhotoStage = 'reception' | 'diagnosis' | 'delivery';

export type PaymentMethod = 'cash' | 'transfer' | 'card';

export type NavSection =
  | 'dashboard'
  | 'console'
  | 'appointments'
  | 'clients'
  | 'inventory'
  | 'migration'
  | 'settings'
  | 'track';

export type ReportTemplateId =
  | 'Entrada.rpt'
  | 'EntradaDom.rpt'
  | 'MiniTicket.rpt'
  | 'Salida.rpt'
  | 'SalidaDom.rpt'
  | 'SalIVA.rpt'
  | 'SalIVADom.rpt'
  | 'Recibo.rpt'
  | 'Prestamo.rpt';

export type PaperFormat = 'letter' | 'half_duplicate' | 'thermal_80mm';
export type ReportLanguage = 'es' | 'en';
export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled';

export interface WhatsAppTemplates {
  intake: string;
  quote_ready: string;
  ready_for_pickup: string;
}

export interface Tenant {
  id: string;
  name: string;
  tax_id: string;
  sector: IndustrySector;
  currency: string;
  iva_rate: number;
  folio_prefix: string;
  whatsapp_enabled: boolean;
  whatsapp_templates: WhatsAppTemplates;
  phone: string;
  email: string;
  warranty_days?: number;
  legal_terms?: string;
  created_at: string;
}

export interface Branch {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  is_hq: boolean;
  address: string;
  city: string;
  phone: string;
  business_hours: string;
}

export interface Client {
  id: string;
  tenant_id: string;
  name: string;
  rut: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  notes?: string;
}

export interface CustomerAsset {
  id: string;
  tenant_id: string;
  client_id: string;
  category: string;
  brand: string;
  model: string;
  serial_imei: string;
  password_pattern?: string;
  custom_attributes: Record<string, string>;
}

export interface CatalogItem {
  id: string;
  tenant_id: string;
  branch_id: string;
  sku: string;
  name: string;
  category: 'part' | 'service';
  cost_price: number;
  sale_price: number;
  stock_qty: number;
  min_stock: number;
}

export interface LoanAsset {
  id: string;
  tenant_id: string;
  branch_id: string;
  code: string;
  name: string;
  brand_model: string;
  serial_number: string;
  status: 'available' | 'loaned' | 'maintenance';
  condition_notes: string;
}

export interface WorkOrderItem {
  id: string;
  source: 'catalog' | 'free';
  catalog_item_id?: string;
  sku?: string;
  description: string;
  qty: number;
  unit_price: number;
}

export interface WorkOrderPayment {
  id: string;
  date: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
}

export interface WorkOrderPhoto {
  id: string;
  url: string;
  stage: PhotoStage;
  caption: string;
  created_at: string;
}

export interface WorkOrderLoan {
  id: string;
  loan_asset_id: string;
  asset_code: string;
  asset_name: string;
  loaned_at: string;
  returned_at?: string;
  delivery_notes: string;
}

export interface WorkOrder {
  id: string;
  tenant_id: string;
  branch_id: string;
  folio: string;
  tracking_code: string;
  client_id: string;
  asset_id: string;
  status: OrderStatus;
  modality: ServiceModality;
  visit_address?: string;
  visit_scheduled_at?: string;
  accessories_received: string;
  entry_condition: string;
  reported_symptoms: string;
  technical_diagnosis: string;
  work_performed: string;
  parts_and_observations: string;
  assigned_technician: string;
  apply_iva: boolean;
  discount_amount: number;
  items: WorkOrderItem[];
  payments: WorkOrderPayment[];
  photos: WorkOrderPhoto[];
  loan?: WorkOrderLoan;
  warranty_days?: number;
  legacy_mdb_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Appointment {
  id: string;
  tenant_id: string;
  branch_id: string;
  subject: string;
  client_id: string;
  modality: ServiceModality;
  visit_address?: string;
  technician: string;
  date: string;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  notes?: string;
  work_order_id?: string;
  created_at: string;
}

export interface TeamProfile {
  id: string;
  tenant_id: string;
  branch_id: string | null; // null = Casa Matriz (acceso todas las sucursales)
  full_name: string;
  email: string;
  role: RoleType;
  active: boolean;
  created_at: string;
}

export interface AuthSessionUser {
  id: string;
  email: string;
  full_name: string;
  tenant_id: string;
  branch_id: string | null;
  role: RoleType;
  mode: 'supabase' | 'demo';
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  connected: boolean;
  demoMode?: boolean;
  source?: 'env' | 'local' | 'none';
  lastCheckedAt?: string;
  lastError?: string;
}

export interface ErpState {
  tenants: Tenant[];
  branches: Branch[];
  profiles: TeamProfile[];
  clients: Client[];
  assets: CustomerAsset[];
  catalogItems: CatalogItem[];
  loanAssets: LoanAsset[];
  workOrders: WorkOrder[];
  appointments: Appointment[];
}
