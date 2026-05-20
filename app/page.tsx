"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBaseAccountSDK } from "@base-org/account";
import {
  createPublicClient,
  encodeFunctionData,
  http,
  isAddress,
  parseEther,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { useAccount, useConnect, useDisconnect, useSendTransaction, useSwitchChain } from "wagmi";
import {
  BASE_BUILDER_CODE_DATA_SUFFIX,
  CHECK_IN_CONTRACT_ADDRESS,
  CHECK_IN_INTERVAL_SECONDS,
  CHECK_IN_PRICE_ETH,
  checkInAbi,
} from "@/lib/checkInContract";
import {
  formatCountdown,
  getDisplayName,
  getSecondsUntilNextCheckIn,
  getTapMultiplier,
  loadLeaderboard,
  saveLeaderboard,
  safeParseScore,
  toSortedLeaderboard,
  type LeaderboardPlayer,
} from "@/lib/gameState";
import { base } from "wagmi/chains";

type Screen = "menu" | "leaderboard" | "checkin" | "tap";

const baseClient = createPublicClient({
  chain: base,
  transport: http(),
});

function withBuilderCodeDataSuffix(data: Hex): Hex {
  return `${data}${BASE_BUILDER_CODE_DATA_SUFFIX.slice(2)}` as Hex;
}

export default function HomePage() {
  const { address: farcasterAddress, isConnected, chainId } = useAccount();
  const { connect, connectAsync, connectors, isPending: isConnectPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();

  const [screen, setScreen] = useState<Screen>("menu");
  const [leaderboardMap, setLeaderboardMap] = useState<Record<string, LeaderboardPlayer>>({});
  const [status, setStatus] = useState<string>(
    "Ожидаю кошелек из Base App/Farcaster. Интерфейс подключения скрыт."
  );
  const [nextCheckInTimer, setNextCheckInTimer] = useState<number>(0);
  const [baseAddress, setBaseAddress] = useState<string | null>(null);
  const [checkInLoading, setCheckInLoading] = useState(false);
  const [walletSource, setWalletSource] = useState<"base" | "farcaster" | null>(null);
  const [showWalletOptions, setShowWalletOptions] = useState(false);
  const attemptedAutoConnectRef = useRef(false);

  const baseProvider = useMemo(() => {
    try {
      const sdk = createBaseAccountSDK({
        appName: "Evil Squirrel Tap",
        appChainIds: [base.id],
      });
      return sdk.getProvider();
    } catch {
      return null;
    }
  }, []);

  const address = baseAddress ?? farcasterAddress;

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
        lastCheckInAt: null,
        updatedAt: Date.now(),
      }
    );
  }, [leaderboardMap, playerKey]);

  const tapMultiplier = getTapMultiplier(player?.streak ?? 0);
  const pointsPerTap = safeParseScore(tapMultiplier);
  const leaderboard = toSortedLeaderboard(leaderboardMap).slice(0, 20);
  const walletConnectors = useMemo(
    () =>
      connectors.filter((connector) => {
        const name = connector.name.toLowerCase();
        return (
          name.includes("rabby") ||
          name.includes("metamask") ||
          name.includes("injected") ||
          name.includes("base") ||
          name.includes("farcaster")
        );
      }),
    [connectors]
  );
  const preferredConnector = useMemo(
    () =>
      walletConnectors.find((connector) => connector.name.toLowerCase().includes("rabby")) ??
      walletConnectors.find((connector) => connector.name.toLowerCase().includes("metamask")) ??
      walletConnectors.find((connector) => connector.name.toLowerCase().includes("injected")) ??
      walletConnectors[0],
    [walletConnectors]
  );

  useEffect(() => {
    setLeaderboardMap(loadLeaderboard());
  }, []);

  useEffect(() => {
    saveLeaderboard(leaderboardMap);
  }, [leaderboardMap]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNextCheckInTimer(
        getSecondsUntilNextCheckIn(player?.lastCheckInAt, CHECK_IN_INTERVAL_SECONDS)
      );
    }, 1000);

    setNextCheckInTimer(
      getSecondsUntilNextCheckIn(player?.lastCheckInAt, CHECK_IN_INTERVAL_SECONDS)
    );

    return () => window.clearInterval(interval);
  }, [player?.lastCheckInAt]);

  const syncOnchainPlayer = useCallback(async (walletAddress: Address): Promise<{
    lastCheckInAt: number;
    streak: number;
    totalCheckIns: number;
  }> => {
    const [lastCheckInAt, streak, totalCheckIns] = await baseClient.readContract({
      address: CHECK_IN_CONTRACT_ADDRESS,
      abi: checkInAbi,
      functionName: "getPlayer",
      args: [walletAddress],
    });

    const normalizedAddress = walletAddress.toLowerCase();
    const onchainPlayer = {
      lastCheckInAt: Number(lastCheckInAt) === 0 ? 0 : Number(lastCheckInAt) * 1000,
      streak: Number(streak),
      totalCheckIns: Number(totalCheckIns),
    };

    setLeaderboardMap((prev) => {
      const existing = prev[normalizedAddress] ?? {
        address: normalizedAddress,
        name: getDisplayName(normalizedAddress),
        score: 0,
        streak: 0,
        totalCheckIns: 0,
        lastCheckInAt: null,
        updatedAt: Date.now(),
      };

      return {
        ...prev,
        [normalizedAddress]: {
          ...existing,
          streak: onchainPlayer.streak,
          totalCheckIns: onchainPlayer.totalCheckIns,
          lastCheckInAt: onchainPlayer.lastCheckInAt === 0 ? null : onchainPlayer.lastCheckInAt,
          updatedAt: Date.now(),
        },
      };
    });

    return onchainPlayer;
  }, []);

  useEffect(() => {
    if (!address || !isAddress(address)) {
      return;
    }

    syncOnchainPlayer(address).catch(() => {
      // Keep local cached state if the public RPC read is temporarily unavailable.
    });
  }, [address, syncOnchainPlayer]);

  function applyConfirmedCheckIn(onchainPlayer?: {
    lastCheckInAt: number;
    streak: number;
    totalCheckIns: number;
  }): void {
    if (!player || !playerKey) {
      return;
    }

    setLeaderboardMap((prev) => {
      const existing = prev[playerKey] ?? player;
      const now = Date.now();
      const isContinuedStreak =
        existing.lastCheckInAt !== null &&
        now <= existing.lastCheckInAt + CHECK_IN_INTERVAL_SECONDS * 2 * 1000;

      return {
        ...prev,
        [playerKey]: {
          ...existing,
          streak: onchainPlayer?.streak ?? (isContinuedStreak ? existing.streak + 1 : 1),
          totalCheckIns: onchainPlayer?.totalCheckIns ?? existing.totalCheckIns + 1,
          lastCheckInAt: onchainPlayer?.lastCheckInAt ?? now,
          updatedAt: Date.now(),
        },
      };
    });

    setStatus("Чекин подтвержден контрактом. +10% множитель к тапам!");
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

  const handleConnectWallet = useCallback(
    async (connector = preferredConnector): Promise<void> => {
      if (!connector) {
        setStatus("Установи Rabby или MetaMask и попробуй подключить кошелек снова.");
        return;
      }

      try {
        await connectAsync({ connector, chainId: base.id });
        setBaseAddress(null);
        setWalletSource("farcaster");
        setShowWalletOptions(false);
        setStatus(`Подключен кошелек: ${connector.name}.`);
      } catch (error) {
        setShowWalletOptions(true);
        setStatus(`Не удалось подключить кошелек: ${(error as Error).message}`);
      }
    },
    [connectAsync, preferredConnector]
  );

  const handleDisconnectWallet = useCallback((): void => {
    setBaseAddress(null);
    setWalletSource(null);
    disconnect();
    setStatus("Кошелек отключен.");
  }, [disconnect]);

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

    if (nextCheckInTimer > 0) {
      setStatus(`Чекин будет доступен через ${formatCountdown(nextCheckInTimer)}.`);
      return;
    }

    setCheckInLoading(true);
    try {
      const secondsUntilNextCheckIn = Number(
        await baseClient.readContract({
          address: CHECK_IN_CONTRACT_ADDRESS,
          abi: checkInAbi,
          functionName: "secondsUntilNextCheckIn",
          args: [walletAddress],
        })
      );

      if (secondsUntilNextCheckIn > 0) {
        setNextCheckInTimer(secondsUntilNextCheckIn);
        setStatus(`Чекин будет доступен через ${formatCountdown(secondsUntilNextCheckIn)}.`);
        return;
      }

      setStatus(`Подтверди checkIn() в кошельке. Стоимость: ${CHECK_IN_PRICE_ETH} ETH.`);

      let txHash: Hex | null = null;
      const checkInData = withBuilderCodeDataSuffix(
        encodeFunctionData({
          abi: checkInAbi,
          functionName: "checkIn",
        })
      );

      if (baseProvider && walletSource === "base") {
        const hash = (await baseProvider.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: walletAddress,
              to: CHECK_IN_CONTRACT_ADDRESS,
              data: checkInData,
              value: toHex(parseEther(CHECK_IN_PRICE_ETH)),
            },
          ],
        })) as Hex;
        txHash = hash;
      } else {
        if (chainId !== base.id) {
          await switchChainAsync({ chainId: base.id });
        }

        txHash = await sendTransactionAsync({
          chainId: base.id,
          to: CHECK_IN_CONTRACT_ADDRESS,
          data: checkInData,
          value: parseEther(CHECK_IN_PRICE_ETH),
        });
      }

      await baseClient.waitForTransactionReceipt({ hash: txHash });

      try {
        const onchainPlayer = await syncOnchainPlayer(walletAddress);
        applyConfirmedCheckIn({
          ...onchainPlayer,
          lastCheckInAt: onchainPlayer.lastCheckInAt || Date.now(),
        });
      } catch {
        // Some in-app webviews can briefly lose public RPC access after wallet return.
        // The transaction is already confirmed, so keep the game responsive locally.
        applyConfirmedCheckIn();
      }
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

  const alreadyCheckedIn = nextCheckInTimer > 0;

  return (
    <main className="game-shell">
      <section className="game-panel">
        <header className="game-header">
          <h1>Evil Squirrel Tap</h1>
          <p>Тапай злую белку, делай ежедневный onchain чекин и расти в лидерборде.</p>
        </header>

        <section className="wallet-panel" aria-label="Подключение кошелька">
          {address ? (
            <div className="wallet-line">
              <span>{getDisplayName(address)}</span>
              <span>{address.slice(0, 6)}...{address.slice(-4)}</span>
              <button type="button" onClick={handleDisconnectWallet}>
                Отключить
              </button>
            </div>
          ) : (
            <>
              <p>Подключи Rabby, MetaMask, Base Account или Farcaster, чтобы играть через сайт.</p>
              <button
                type="button"
                onClick={() => {
                  if (walletConnectors.length > 1) {
                    setShowWalletOptions((current) => !current);
                    return;
                  }
                  void handleConnectWallet();
                }}
                disabled={isConnectPending}
              >
                {isConnectPending ? "Подключение..." : "Подключить кошелек"}
              </button>
              {showWalletOptions ? (
                <div className="wallet-options">
                  {walletConnectors.length === 0 ? (
                    <small>Rabby или MetaMask не найдены в браузере.</small>
                  ) : (
                    walletConnectors.map((connector) => (
                      <button
                        type="button"
                        key={connector.uid}
                        onClick={() => void handleConnectWallet(connector)}
                        disabled={isConnectPending}
                      >
                        {connector.name}
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </>
          )}
        </section>

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
            <h2>Ончейн чекин (Base Mainnet)</h2>
            <p>
              До следующего чекина: <strong>{formatCountdown(nextCheckInTimer)}</strong>
            </p>
            <p>
              Стоимость чекина: <strong>{CHECK_IN_PRICE_ETH} ETH</strong>
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
                ? "Чекин скоро будет доступен"
                : checkInLoading
                ? "Ожидание подтверждения..."
                : "Сделать onchain чекин"}
            </button>
            <small>
              Контракт принимает чек-ин каждые 2 минуты. Каждый успешный чек-ин дает +10% к
              каждому тапу, пропуск окна сбрасывает серию.
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
