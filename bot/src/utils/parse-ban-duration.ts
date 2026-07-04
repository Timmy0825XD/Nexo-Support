export const BAN_DURATION_VALUES = [
  '7_days',
  '1_month',
  '2_months',
  '6_months',
  'permanent',
] as const;

export type BanDurationValue = (typeof BAN_DURATION_VALUES)[number];

const BAN_DURATION_LABELS: Record<BanDurationValue, string> = {
  '7_days': '7 days',
  '1_month': '1 month',
  '2_months': '2 months',
  '6_months': '6 months',
  permanent: 'Permanent',
};

export class InvalidBanDurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBanDurationError';
  }
}

function addUtcMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

export function parseBanDuration(input: string): Date | null {
  const normalized = input.trim() as BanDurationValue;
  if (!BAN_DURATION_VALUES.includes(normalized)) {
    throw new InvalidBanDurationError('Invalid ban duration selected.');
  }

  const now = new Date();

  switch (normalized) {
    case '7_days':
      return new Date(now.getTime() + 7 * 86_400_000);
    case '1_month':
      return addUtcMonths(now, 1);
    case '2_months':
      return addUtcMonths(now, 2);
    case '6_months':
      return addUtcMonths(now, 6);
    case 'permanent':
      return null;
  }
}

export function formatBanDurationLabel(input: string): string {
  const normalized = input.trim() as BanDurationValue;
  return BAN_DURATION_LABELS[normalized] ?? input;
}
