import { services } from '../data/servicesProvided.json';

export type Service = (typeof services)[number]['services'][number];

export function findServiceByTitle(title: string): Service | null {
  for (const category of services) {
    const service = category.services.find(item => item.title === title);
    if (service) return service;
  }
  return null;
}

export function formatCost(costLow: number, costHigh: number | null): string {
  const currency = (value: number) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return costHigh === null ? `Starts at ${currency(costLow)}` : `${currency(costLow)} - ${currency(costHigh)}`;
}
