export type ImportantMatchKind = 'semi' | '3rd' | 'final';

const IMPORTANT_MATCH_CONFIG: Record<
  ImportantMatchKind,
  { channelPrefix: string; thumbnailBadge: string }
> = {
  semi: { channelPrefix: 'semi', thumbnailBadge: 'SEMI' },
  '3rd': { channelPrefix: '3rd', thumbnailBadge: '3RD' },
  final: { channelPrefix: 'final', thumbnailBadge: 'FINAL' },
};

function normalizeMatchText(round: string, group: string): string {
  return `${group} ${round}`.trim().toLowerCase();
}

export function resolveImportantMatchKind(match: {
  round: string;
  group: string;
}): ImportantMatchKind | null {
  const group = match.group.trim();
  const groupLower = group.toLowerCase();
  const combined = normalizeMatchText(match.round, match.group);

  if (
    groupLower === 'third place' ||
    /\b3rd\b|third[\s_-]?place|bronze[\s_-]?match|consolation/i.test(combined)
  ) {
    return '3rd';
  }

  if (
    groupLower === 'semifinals' ||
    /\bsemi[\s_-]?final|\bsemifinal|\bsemis\b|\bsemi\b|\bsf\d*\b/i.test(combined)
  ) {
    return 'semi';
  }

  if (
    groupLower === 'grand finals' ||
    (/\bgrand[\s_-]?final|\bfinal\b|\bgf\b/i.test(combined) && !/\bsemi/i.test(combined))
  ) {
    return 'final';
  }

  return null;
}

export function getImportantMatchChannelPrefix(kind: ImportantMatchKind): string {
  return IMPORTANT_MATCH_CONFIG[kind].channelPrefix;
}

export function getImportantMatchThumbnailBadge(kind: ImportantMatchKind): string {
  return IMPORTANT_MATCH_CONFIG[kind].thumbnailBadge;
}
