import { Car, Cpu, Laptop, Smartphone, Wrench, type LucideIcon } from 'lucide-react';
import type { IndustrySector } from '../types/erp';

export interface SectorIconMeta {
  Icon: LucideIcon;
  bg: string;
}

export function getSectorIconMeta(sector: IndustrySector): SectorIconMeta {
  switch (sector) {
    case 'mobile':
      return {
        bg: 'bg-violet-50 text-violet-600 border-violet-200/70',
        Icon: Smartphone,
      };
    case 'machinery':
      return {
        bg: 'bg-[#EBF8F6] text-[#1B998B] border-[#1B998B]/25',
        Icon: Wrench,
      };
    case 'appliances':
      return {
        bg: 'bg-amber-50 text-amber-600 border-amber-200/70',
        Icon: Cpu,
      };
    case 'automotive':
      return {
        bg: 'bg-[#EBF4FA] text-[#1A4B7C] border-[#3E92CC]/30',
        Icon: Car,
      };
    default:
      return {
        bg: 'bg-[#EBF4FA] text-[#3E92CC] border-[#3E92CC]/25',
        Icon: Laptop,
      };
  }
}
