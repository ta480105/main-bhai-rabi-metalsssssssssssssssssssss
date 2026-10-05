// Currency and Date formatting utilities for India Standard Time (IST)

export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-IN').format(num);
}

export function getMonthName(monthStr: string): string {
  if (!monthStr || !monthStr.includes('-')) return monthStr;
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export function getDaysInMonth(monthStr: string): number {
  if (!monthStr || !monthStr.includes('-')) return 31;
  const [year, month] = monthStr.split('-');
  return new Date(parseInt(year, 10), parseInt(month, 10), 0).getDate();
}

export function getISTToday(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

export function getISTCurrentMonth(): string {
  const today = getISTToday();
  return today.substring(0, 7); // YYYY-MM
}

import { MonthlyRatesDoc } from '../types';

export function getMonthlyRate(
  monthlyRates: MonthlyRatesDoc[],
  pieceSizeId: string,
  monthStr: string,
  fallbackRate: number = 0
): number {
  const monthDoc = monthlyRates.find((m) => m.month === monthStr);
  if (monthDoc?.rates && typeof monthDoc.rates[pieceSizeId] === 'number') {
    return monthDoc.rates[pieceSizeId];
  }
  return fallbackRate;
}
