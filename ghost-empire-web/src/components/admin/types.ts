// src/components/admin/types.ts — shared admin types hoisted from AdminClient so
// lazily-loaded section modules can import them without pulling in the monolith.

export type AuditEntry = {
  id: string;
  adminId: string;
  adminName: string | null;
  targetName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: string;
};

export type BotConfigData = {
  id: string;
  messageReward: number;
  messageCooldownSeconds: number;
  voiceRewardPerMinute: number;
  voiceTickSeconds: number;
  afkGivesReward: boolean;
  mutedGivesReward: boolean;
  enabled: boolean;
  happyHourEnabled: boolean;
  happyHourStart: number;
  happyHourEnd: number;
  happyHourMultiplier: number;
};

export type ScheduleSlot = {
  id: string;
  dayOfWeek: number;
  startHour: number;
  startMinute: number;
  durationMinutes: number;
  title: string | null;
  platform: string | null;
  active: boolean;
};

export type TwitchEventSubData = {
  streamerConnected: boolean;
  broadcasterLogin: string | null;
  broadcasterId: string | null;
  connectedAt: string | null;
  subscriptions: Array<{
    id: string;
    type: string;
    status: string;
    lastSeenAt: string | null;
    createdAt: string;
  }>;
  recentEvents: Array<{
    id: string;
    type: string;
    userId: string | null;
    tokensGranted: number | null;
    receivedAt: string;
  }>;
};

export type StreamlabsConnectionData =
  | { connected: false }
  | {
      connected: true;
      streamlabsUsername: string | null;
      connectedAt: string;
      lastPolledAt: string | null;
      lastSeenDonationId: string | null;
    };

export type UnmatchedDonation = {
  id: string;
  externalId: string;
  donorName: string;
  message: string | null;
  amountGrosze: number;
  currency: string;
  donatedAt: string;
};

export type CodeRow = { id: string; code: string; label: string | null; active: boolean; shownCount: number; lastShownAt: string | null };
export type CodeConfig = { enabled: boolean; intervalSeconds: number; title: string; accentColor: string };

export type EventRow = {
  id: string;
  type: string;
  name: string;
  description: string | null;
  multiplier: number | null;
  prize: string | null;
  winnersCount: number | null;
  requirement: string | null;
  ticketPrice: number | null;
  maxTicketsPerUser: number | null;
  startsAt: string | null;
  endsAt: string | null;
  drawnAt: string | null;
  active: boolean;
  entriesCount: number;
  ticketsCount: number;
};

export type Drop = {
  id: string;
  code: string;
  reward: number;
  bonusReward: number;
  bonusSlots: number;
  expiresAt: string | null;
  createdAt: string;
  claimsCount: number;
};

export type PendingOrder = {
  id: string;
  amount: number;
  reason: string;
  createdAt: string;
  shopItem: { name: string; imageEmoji: string | null; category: string } | null;
  user: { username: string | null; displayName: string | null; discordId: string | null; discordUsername: string | null };
};

export type StreamAlertsData = {
  overlayToken: string | null;
  settings: {
    enabledTypes: string[];
    durationMs: number;
    accentColor: string;
    soundEnabled: boolean;
    sizeScale: number;
    textScale: number;
    textColor: string;
  };
  allTypes: string[];
  recent: Array<{
    id: string;
    type: string;
    title: string;
    message: string;
    icon: string | null;
    actorName: string | null;
    amount: number | null;
    amountLabel: string | null;
    createdAt: string;
    shownAt: string | null;
  }>;
};

export type ShopItemRow = {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  imageEmoji: string | null;
  imageUrl: string | null;
  stock: number;
  totalStock: number;
  hot: boolean;
  active: boolean;
  featured: boolean;
  requiresSubTier: string | null;
  requiresMinLevel: number | null;
  requiresMinMonths: number | null;
  requiresAchievement: string | null;
};
