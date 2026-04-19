"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBaseAccountSDK } from "@base-org/account";
import { createPublicClient, http, isAddress, parseEther, type Address, type Hex } from "viem";
import { useAccount, useConnect, useSendTransaction, useSwitchChain } from "wagmi";
import {
  formatCountdown,
  getDisplayName,
  getSecondsUntilNextUtcMidnight,
  getTapMultiplier,
  getUtcDayKey,
  loadLeaderboard,
  saveLeaderboard,
  safeParseScore,
  toSortedLeaderboard,
  type LeaderboardPlayer,
} from "@/lib/gameState";
import { baseSepolia } from "wagmi/chains";

type Screen = "menu" | "leaderboard" | "checkin" | "tap";

const baseSepoliaClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

export default function HomePage() {
  const { address: farcasterAddress, isConnected, chainId } = useAccount();
  const { connect, connectors } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();

  const [screen, setScreen] = useState<Screen>("menu");
  const [leaderboardMap, setLeaderboardMap] = useState<Record<string, LeaderboardPlayer>>({});
  const [status, setStatus] = useState<string>(
    "Ожидаю кошелек из Base App/Farcaster. Интерфейс подключения скрыт."
  );
  const [nextCheckInTimer, setNextCheckInTimer] = useState<number>(
    getSecondsUntilNextUtcMidnight()
  );
  const [baseAddress, setBaseAddress] = useState<string | null>(null);
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [walletSource, setWalletSource] = useState<"base" | "farcaster" | null>(null);
  const attemptedAutoConnectRef = useRef(false);

  const baseProvider = useMemo(() => {
    try {
      const sdk = createBaseAccountSDK({
        appName: "Evil Squirrel Tap",
        appChainIds: [baseSepolia.id],
      });
      return sdk.getProvider();
    } catch {
      return null;
    }
  }, []);

  const address = baseAddress ?? farcasterAddress;

  const currentDayKey = getUtcDayKey();
  const playerKey = address?.toLowerCase() ?? "";

  const player = useMemo<LeaderboardPlayer | null>(() => {
    if (!playerKey) {
      return null;
    }
    return (
      leaderboardMap[playerKey] ?? {
        address: playerKey,
        name: getDisplayName(playerKey),
        score: 0,
        streak: 0,
        totalCheckIns: 0,
        lastCheckInDay: null,
        updatedAt: Date.now(),
      }
    );
  }, [leaderboardMap, playerKey]);

  const tapMultiplier = getTapMultiplier(player?.streak ?? 0);
  const pointsPerTap = safeParseScore(tapMultiplier);
  const leaderboard = toSortedLeaderboard(leaderboardMap).slice(0, 20);

  useEffect(() => {
    setLeaderboardMap(loadLeaderboard());
  }, []);

  useEffect(() => {
    saveLeaderboard(leaderboardMap);
  }, [leaderboardMap]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNextCheckInTimer(getSecondsUntilNextUtcMidnight());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  function applyConfirmedCheckIn(): void {
    if (!player || !playerKey) {
      return;
    }

    setLeaderboardMap((prev) => {
      const existing = prev[playerKey] ?? player;
      const isRepeatedToday = existing.lastCheckInDay === currentDayKey;
      if (isRepeatedToday) {
        return prev;
      }

      const shouldResetStreak =
        existing.lastCheckInDay !== null &&
        existing.lastCheckInDay !== currentDayKey &&
        new Date(`${currentDayKey}T00:00:00.000Z`).getTime() -
          new Date(`${existing.lastCheckInDay}T00:00:00.000Z`).getTime() >
          24 * 60 * 60 * 1000;

      const nextStreak = shouldResetStreak ? 1 : existing.streak + 1;

      return {
        ...prev,
        [playerKey]: {
          ...existing,
          streak: nextStreak,
          totalCheckIns: existing.totalCheckIns + 1,
          lastCheckInDay: currentDayKey,
          updatedAt: Date.now(),
        },
      };
    });

    setStatus("Чекин подтвержден onchain. +10% множитель к тапам!");
  }

  function updatePlayer(update: (current: LeaderboardPlayer) => LeaderboardPlayer): void {
    if (!player || !playerKey) {
      return;
    }

    setLeaderboardMap((prev) => {
      const current = prev[playerKey] ?? player;
      return {
        ...prev,
        [playerKey]: {
          ...update(current),
          updatedAt: Date.now(),
        },
      };
    });
  }

  const connectBaseAccount = useCallback(async (interactive: boolean): Promise<boolean> => {
    if (!baseProvider) {
      return false;
    }

    try {
      const method = interactive ? "eth_requestAccounts" : "eth_accounts";
      const accounts = (await baseProvider.request({
        method,
      })) as string[];

      const first = accounts?.[0];
      if (!first) {
        return false;
      }

      setBaseAddress(first.toLowerCase());
      setWalletSource("base");
      return true;
    } catch {
      return false;
    }
  }, [baseProvider]);

  const connectFarcaster = useCallback(async (interactive: boolean): Promise<boolean> => {
    if (isConnected && farcasterAddress) {
      setWalletSource("farcaster");
      return true;
    }

    if (!interactive) {
      return false;
    }

    const connector = connectors[0];
    if (!connector) {
      return false;
    }

    try {
      await connect({ connector });
      setWalletSource("farcaster");
      return true;
    } catch {
      return false;
    }
  }, [connect, connectors, farcasterAddress, isConnected]);

  const ensureAnyWalletConnected = useCallback(async (interactive: boolean): Promise<boolean> => {
    if (await connectBaseAccount(interactive)) {
      setStatus("Подключен Base Account SDK.");
      return true;
    }

    if (await connectFarcaster(interactive)) {
      setStatus("Подключен Farcaster Mini App кошелек.");
      return true;
    }

    if (interactive) {
      setStatus("Не удалось получить кошелек. Открой игру внутри Base App или Farcaster.");
    }
    return false;
  }, [connectBaseAccount, connectFarcaster]);

  useEffect(() => {
    if (attemptedAutoConnectRef.current) {
      return;
    }
    attemptedAutoConnectRef.current = true;
    void ensureAnyWalletConnected(false);
  }, [ensureAnyWalletConnected]);

  async function handleCheckIn(): Promise<void> {
    const connected = await ensureAnyWalletConnected(true);
    if (!connected || !address || !player) {
      return;
    }
    if (!isAddress(address)) {
      setStatus("Некорректный адрес кошелька.");
      return;
    }
    const walletAddress: Address = address;

    if (player.lastCheckInDay === currentDayKey) {
      setStatus("Сегодня ты уже сделал чекин. Возвращайся после 00:00 UTC.");
      return;
    }

    setCheckInLoading(true);
    try {
      setStatus("Подтверди onchain чекин в кошельке...");

      let txHash: Hex | null = null;

      if (baseProvider && walletSource === "base") {
        const hash = (await baseProvider.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: walletAddress,
              to: walletAddress,
              value: "0x1",
            },
          ],
        })) as Hex;
        txHash = hash;
      } else {
        if (chainId !== baseSepolia.id) {
          await switchChainAsync({ chainId: baseSepolia.id });
        }

        txHash = await sendTransactionAsync({
          chainId: baseSepolia.id,
          to: walletAddress,
          value: parseEther("0.000000000000000001"),
        });
      }

      await baseSepoliaClient.waitForTransactionReceipt({ hash: txHash });
      applyConfirmedCheckIn();
    } catch (error) {
      setStatus(`Транзакция отклонена или не прошла: ${(error as Error).message}`);
    } finally {
      setCheckInLoading(false);
    }
  }

  function handleTap(): void {
    if (!player) {
      void ensureAnyWalletConnected(true);
      setStatus("Нужен кошелек из Base App/Farcaster, чтобы копить очки.");
      return;
    }

    updatePlayer((current) => ({
      ...current,
      score: safeParseScore(current.score + pointsPerTap),
      name: getDisplayName(current.address),
    }));
  }

  const alreadyCheckedIn = player?.lastCheckInDay === currentDayKey;

  return (
    <main className="game-shell">
      <section className="game-panel">
        <header className="game-header">
          <h1>Evil Squirrel Tap</h1>
          <p>Тапай злую белку, делай ежедневный onchain чекин и расти в лидерборде.</p>
        </header>

        <nav className="menu-grid" aria-label="Главное меню">
          <button type="button" onClick={() => setScreen("leaderboard")}>
            Лидерборд
          </button>
          <button type="button" onClick={() => setScreen("checkin")}>
            Ончейн чекин
          </button>
          <button type="button" onClick={() => setScreen("tap")}>
            Начать тапать
          </button>
        </nav>

        {screen === "menu" ? (
          <div className="card">
            <h2>Меню игры</h2>
            <p>Выбери режим: таблица лидеров, ежедневный чекин или режим тапалки.</p>
          </div>
        ) : null}

        {screen === "tap" ? (
          <div className="card tap-mode">
            <h2>Тапалка</h2>
            <p>
              Очки за тап: <strong>{pointsPerTap.toFixed(2)}</strong> (множитель{" "}
              <strong>x{tapMultiplier.toFixed(2)}</strong>)
            </p>
            <p>
              Текущий счет: <strong>{player?.score.toFixed(2) ?? "0.00"}</strong>
            </p>
            <button type="button" className="squirrel" onClick={handleTap}>
              🐿️🥜
            </button>
          </div>
        ) : null}

        {screen === "checkin" ? (
          <div className="card">
            <h2>Ончейн чекин (Base Sepolia)</h2>
            <p>
              До следующего окна чекина: <strong>{formatCountdown(nextCheckInTimer)}</strong> (UTC)
            </p>
            <p>
              Серия чекинов: <strong>{player?.streak ?? 0}</strong>
            </p>
            <p>
              Всего чекинов: <strong>{player?.totalCheckIns ?? 0}</strong>
            </p>
            <button
              type="button"
              onClick={handleCheckIn}
              disabled={alreadyCheckedIn || checkInLoading}
            >
              {alreadyCheckedIn
                ? "Чекин уже сделан"
                : checkInLoading
                ? "Ожидание подтверждения..."
                : "Сделать onchain чекин"}
            </button>
            <small>
              Если пропустить календарный день (UTC), серия сбрасывается. Каждый чекин дает +10% к
              каждому тапу.
            </small>
          </div>
        ) : null}

        {screen === "leaderboard" ? (
          <div className="card">
            <h2>Лидерборд</h2>
            {leaderboard.length === 0 ? (
              <p>Пока пусто. Подключи кошелек и набери первые очки.</p>
            ) : (
              <ol className="leaderboard">
                {leaderboard.map((entry) => (
                  <li key={entry.address}>
                    <span>{entry.name}</span>
                    <span>{entry.score.toFixed(2)} pts</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : null}

        <p className="status">{status}</p>
      </section>
    </main>
  );
}
