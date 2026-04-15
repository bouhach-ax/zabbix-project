/**
 * ZabbixPilot Design Tokens
 * Single source of truth for all colors, typography, shadows.
 * Use these — never raw hex values in components.
 */
export const tokens = {
  colors: {
    primary: '#D4500A',
    primaryHover: '#B8420A',
    primaryLight: '#FFF0E8',
    bgDark: '#1A1A2E',
    bgSurface: '#16213E',
    bgCard: '#0F3460',
    bgLight: '#F5F5FA',
    textPrimary: '#1A1A2E',
    textMuted: '#4A4A6A',
    success: '#22C55E',
    successLight: '#F0FDF4',
    warning: '#F59E0B',
    warningLight: '#FFFBEB',
    danger: '#EF4444',
    dangerLight: '#FEF2F2',
    info: '#3B82F6',
    border: '#E2E8F0',
    borderDark: '#2D3748',
  },
  fonts: {
    ui: 'Inter, system-ui, sans-serif',
    mono: 'JetBrains Mono, Fira Code, monospace',
  },
  shadows: {
    card: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
    cardHover: '0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.05)',
  },
  transitions: {
    fast: '150ms ease-out',
    medium: '200ms ease-out',
  },
  status: {
    OK: { bg: '#F0FDF4', text: '#15803D', dot: '#22C55E' },
    PROBLEM: { bg: '#FEF2F2', text: '#B91C1C', dot: '#EF4444' },
    UNKNOWN: { bg: '#F9FAFB', text: '#4B5563', dot: '#9CA3AF' },
    WARNING: { bg: '#FFFBEB', text: '#92400E', dot: '#F59E0B' },
    DISASTER: { bg: '#FEE2E2', text: '#7F1D1D', dot: '#DC2626', pulse: true },
  },
} as const

export type TokenColors = typeof tokens.colors
export type StatusKey = keyof typeof tokens.status
