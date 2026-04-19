export type LeaderboardPlayer = {
  address: string;
  name: string;
  score: number;
  streak: number;
  totalCheckIns: number;
  lastCheckInDay: string | null;
  updatedAt: number;
};

type LeaderboardMap = Record<string, LeaderboardPlayer>;

const STORAGE_KEY = "evil-squirrel-leaderboard-v1";

function getUtcDayStart(date = new Date()): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

export function getUtcDayKey(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getSecondsUntilNextUtcMidnight(now = new Date()): number {
  const next = new Date(getUtcDayStart(now).getTime() + 24 * 60 * 60 * 1000);
  return Math.max(0, Math.floor((next.getTime() - now.getTime()) / 1000));
}

export function formatCountdown(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${`${hours}`.padStart(2, "0")}:${`${minutes}`.padStart(
    2,
    "0"
  )}:${`${seconds}`.padStart(2, "0")}`;
}

export function safeParseScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value * 100) / 100);
}

function normalizePlayer(player: Partial<LeaderboardPlayer>): LeaderboardPlayer {
  return {
    address: player.address ?? "",
    name: player.name ?? "Unnamed Squirrel",
    score: safeParseScore(player.score ?? 0),
    streak: Number.isFinite(player.streak) ? Math.max(0, player.streak ?? 0) : 0,
    totalCheckIns: Number.isFinite(player.totalCheckIns)
      ? Math.max(0, player.totalCheckIns ?? 0)
      : 0,
    lastCheckInDay: player.lastCheckInDay ?? null,
    updatedAt: Number.isFinite(player.updatedAt) ? player.updatedAt ?? Date.now() : Date.now(),
  };
}

export function loadLeaderboard(): LeaderboardMap {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as LeaderboardMap;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).map(([address, player]) => [
        address.toLowerCase(),
        normalizePlayer({ ...player, address }),
      ])
    );
  } catch {
    return {};
  }
}

export function saveLeaderboard(map: LeaderboardMap): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function getDisplayName(address: string): string {
  if (!address) {
    return "Guest";
  }

  const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
  return `Squirrel ${short}`;
}

export function getTapMultiplier(streak: number): number {
  return 1 + Math.max(0, streak) * 0.1;
}

export function toSortedLeaderboard(map: LeaderboardMap): LeaderboardPlayer[] {
  return Object.values(map).sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    return b.updatedAt - a.updatedAt;
  });
}
