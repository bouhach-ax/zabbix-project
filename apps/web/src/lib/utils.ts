/**
 * Shared frontend utility functions.
 */

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Concatenates class names with Tailwind conflict resolution.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * Formats a Date to a locale-aware display string.
 */
export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...options,
  }).format(new Date(date))
}

/**
 * Formats availability percentage with 2 decimal places.
 */
export function formatAvailability(value: number): string {
  return `${value.toFixed(2)}%`
}
