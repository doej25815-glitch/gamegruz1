"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPublicClient, encodeFunctionData, http, isAddress, parseEther, type Address } from "viem";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSendTransaction,
  useSwitchChain,
  useWaitForTransactionReceipt,
} from "wagmi";
import { base } from "wagmi/chains";
import {
  EVIL_SQUIRREL_CHECKIN_INTERVAL_SECONDS,
  EVIL_SQUIRREL_CHECKIN_PRICE_ETH,
  evilSquirrelOnchainAbi,
  getEvilSquirrelContractAddress,
  withEvilSquirrelBuilderCodeDataSuffix,
} from "@/lib/contracts/evilSquirrelOnchain";
import {
  formatCountdown,
  getDisplayName,
  getTapMultiplier,
  loadLeaderboard,
  saveLeaderboard,
  safeParseScore,
  toSortedLeaderboard,
  type LeaderboardPlayer,
} from "@/lib/gameState";

type Screen = "menu" | "leaderboard" | "checkin" | "tap";

const baseClient = createPublicClient({
  chain: base,
  transport: http(),
});

const contractAddress = getEvilSquirrelContractAddress();

function slotToTimestamp(slot: number): number | null {
  if (slot === 0) {
    return null;
  }
  return slot * EVIL_SQUIRREL_CHECKIN_INTERVAL_SECONDS * 1000;
}

export default function HomePage() {
  const { address, isConnected, chainId } = useAccount();
  const { connectAsync, connectors, isPending: isConnectPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const { data: txHash, isPending: isWritePending, sendTransactionAsync } = useSendTransaction();
  const { isLoading: isTxMining, isSuccess: isTxMined } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: Boolean(txHash) },
  });

  const [screen, setScreen] = useState<Screen>("menu");
  const [leaderboardMap, setLeaderboardMap] = useState<Record<string, LeaderboardPlayer>>({});
  const [status, setStatus] = useState("Подключи кошелек, чтобы играть через сайт.");
  const [nextCheckInTimer, setNextCheckInTimer] = useState(0);
  const [pendingTaps, setPendingTaps] = useState(0);
  const [isSubmittingTap, setIsSubmittingTap] = useState(false);
  const [isSubmittingCheckin, setIsSubmittingCheckin] = useState(false);
  const [showWalletOptions, setShowWalletOptions] = useState(false);

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
  const projectedScore = safeParseScore((player?.score ?? 0) + pendingTaps * pointsPerTap);
  const leaderboard = toSortedLeaderboard(leaderboardMap).slice(0, 20);
  const isCorrectChain = chainId === base.id;
  const isBusy = isWritePending || isTxMining || isSubmittingTap || isSubmittingCheckin;
  const canCheckInNow = player ? nextCheckInTimer === 0 : false;

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

  const syncOnchainPlayer = useCallback(async (walletAddress: Address): Promise<void> => {
    const [score, streak, lastCheckinSlot, , totalCheckins] = await baseClient.readContract({
      address: contractAddress,
      abi: evilSquirrelOnchainAbi,
      functionName: "getPlayer",
      args: [walletAddress],
    });

    const normalizedAddress = walletAddress.toLowerCase();

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

      const lastCheckInAt = slotToTimestamp(Number(lastCheckinSlot));

      return {
        ...prev,
        [normalizedAddress]: {
          ...existing,
          score: safeParseScore(Number(score)),
          streak: Number(streak),
          totalCheckIns: Number(totalCheckins),
          lastCheckInAt,
          updatedAt: Date.now(),
        },
      };
    });

    if (Number(lastCheckinSlot) > 0) {
      const nextAt =
        Number(lastCheckinSlot) * EVIL_SQUIRREL_CHECKIN_INTERVAL_SECONDS * 1000 +
        EVIL_SQUIRREL_CHECKIN_INTERVAL_SECONDS * 1000;
      setNextCheckInTimer(Math.max(0, Math.ceil((nextAt - Date.now()) / 1000)));
    } else {
      setNextCheckInTimer(0);
    }
  }, []);

  useEffect(() => {
    if (!address || !isAddress(address)) {
      return;
    }

    syncOnchainPlayer(address).catch(() => {
      // Keep local cached state if RPC is temporarily unavailable.
    });
  }, [address, syncOnchainPlayer]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!player?.lastCheckInAt) {
        setNextCheckInTimer(0);
        return;
      }
      const nextAt = player.lastCheckInAt + EVIL_SQUIRREL_CHECKIN_INTERVAL_SECONDS * 1000;
      setNextCheckInTimer(Math.max(0, Math.ceil((nextAt - Date.now()) / 1000)));
    }, 1000);

    if (!player?.lastCheckInAt) {
      setNextCheckInTimer(0);
    } else {
      const nextAt = player.lastCheckInAt + EVIL_SQUIRREL_CHECKIN_INTERVAL_SECONDS * 1000;
      setNextCheckInTimer(Math.max(0, Math.ceil((nextAt - Date.now()) / 1000)));
    }

    return () => window.clearInterval(interval);
  }, [player?.lastCheckInAt]);

  useEffect(() => {
    const refreshAfterCheckin = async () => {
      if (!isTxMined || !isSubmittingCheckin || !address) {
        return;
      }

      setIsSubmittingCheckin(false);
      try {
        await syncOnchainPlayer(address);
        setStatus("Чекин подтвержден контрактом. +10% множитель к тапам!");
      } catch {
        setStatus("Чекин подтвержден. Состояние обновится при следующем чтении контракта.");
      }
    };

    void refreshAfterCheckin();
  }, [address, isSubmittingCheckin, isTxMined, syncOnchainPlayer]);

  useEffect(() => {
    const refreshAfterTap = async () => {
      if (!isTxMined || !isSubmittingTap || !address) {
        return;
      }

      setPendingTaps(0);
      setIsSubmittingTap(false);
      try {
        await syncOnchainPlayer(address);
        setStatus("Тапы отправлены onchain.");
      } catch {
        setStatus("Тапы отправлены. Счет обновится при следующем чтении контракта.");
      }
    };

    void refreshAfterTap();
  }, [address, isSubmittingTap, isTxMined, syncOnchainPlayer]);

  const handleConnectWallet = useCallback(
    async (connector = preferredConnector): Promise<void> => {
      if (!connector) {
        setStatus("Установи Rabby или MetaMask и попробуй подключить кошелек снова.");
        return;
      }

      try {
        await connectAsync({ connector, chainId: base.id });
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
    disconnect();
    setPendingTaps(0);
    setStatus("Кошелек отключен.");
  }, [disconnect]);

  const ensureWalletReady = useCallback(async (): Promise<boolean> => {
    if (!isConnected || !address) {
      if (preferredConnector) {
        try {
          await connectAsync({ connector: preferredConnector, chainId: base.id });
          setStatus(`Подключен кошелек: ${preferredConnector.name}.`);
          return true;
        } catch {
          setShowWalletOptions(true);
          setStatus("Подключи Rabby, MetaMask или Base Account.");
          return false;
        }
      }
      setStatus("Подключи кошелек.");
      return false;
    }

    if (chainId !== base.id) {
      try {
        await switchChainAsync({ chainId: base.id });
      } catch {
        setStatus("Переключи сеть кошелька на Base Mainnet.");
        return false;
      }
    }

    if (contractAddress === "0x0000000000000000000000000000000000000000") {
      setStatus("Укажи адрес задеплоенного контракта в lib/contracts/evilSquirrelOnchain.ts");
      return false;
    }

    return true;
  }, [address, chainId, connectAsync, isConnected, preferredConnector, switchChainAsync]);

  function handleTap(): void {
    if (!player) {
      void ensureWalletReady();
      return;
    }
    setPendingTaps((current) => current + 1);
  }

  async function handleSendTaps(): Promise<void> {
    if (!(await ensureWalletReady()) || !address || pendingTaps <= 0) {
      return;
    }

    setIsSubmittingTap(true);
    setStatus(`Подтверди tap(${pendingTaps}) в кошельке.`);

    try {
      const data = withEvilSquirrelBuilderCodeDataSuffix(
        encodeFunctionData({
          abi: evilSquirrelOnchainAbi,
          functionName: "tap",
          args: [BigInt(pendingTaps)],
        })
      );

      await sendTransactionAsync({
        chainId: base.id,
        to: contractAddress,
        data,
        value: BigInt(0),
      });
    } catch (error) {
      setIsSubmittingTap(false);
      setStatus(`Транзакция отклонена или не прошла: ${(error as Error).message}`);
    }
  }

  async function handleCheckIn(): Promise<void> {
    if (!(await ensureWalletReady()) || !address || !player) {
      return;
    }

    if (!canCheckInNow) {
      setStatus(`Чекин будет доступен через ${formatCountdown(nextCheckInTimer)}.`);
      return;
    }

    setIsSubmittingCheckin(true);
    setStatus(`Подтверди checkIn() в кошельке. Стоимость: ${EVIL_SQUIRREL_CHECKIN_PRICE_ETH} ETH.`);

    try {
      const data = withEvilSquirrelBuilderCodeDataSuffix(
        encodeFunctionData({
          abi: evilSquirrelOnchainAbi,
          functionName: "checkIn",
        })
      );

      await sendTransactionAsync({
        chainId: base.id,
        to: contractAddress,
        data,
        value: parseEther(EVIL_SQUIRREL_CHECKIN_PRICE_ETH),
      });
    } catch (error) {
      setIsSubmittingCheckin(false);
      setStatus(`Транзакция отклонена или не прошла: ${(error as Error).message}`);
    }
  }

  return (
    <main className="game-shell">
      <section className="game-panel">
        <header className="game-header">
          <h1>Evil Squirrel Tap</h1>
          <p>Тапай злую белку, делай onchain чекин и расти в лидерборде.</p>
        </header>

        <section className="wallet-panel" aria-label="Подключение кошелька">
          {address && isConnected ? (
            <div className="wallet-line">
              <span>{getDisplayName(address)}</span>
              <span>
                {address.slice(0, 6)}...{address.slice(-4)}
              </span>
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

        {isConnected && !isCorrectChain ? (
          <p className="status">Переключите сеть кошелька на Base Mainnet.</p>
        ) : null}

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
            <p>Выбери режим: таблица лидеров, onchain чекин или режим тапалки.</p>
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
              Текущий счет: <strong>{projectedScore.toFixed(2)}</strong>
            </p>
            <p>
              Тапов к отправке: <strong>{pendingTaps}</strong>
            </p>
            <button type="button" className="squirrel" onClick={handleTap} disabled={isBusy || !isCorrectChain}>
              🐿️🥜
            </button>
            <button
              type="button"
              className="send-taps"
              onClick={() => void handleSendTaps()}
              disabled={pendingTaps <= 0 || isBusy || !isCorrectChain || !isConnected}
            >
              {isSubmittingTap || isWritePending || isTxMining
                ? "Транзакция..."
                : `Отправить ${pendingTaps} тап(ов) onchain`}
            </button>
            <small>Тапы копятся локально, затем одной транзакцией уходят в контракт tap().</small>
          </div>
        ) : null}

        {screen === "checkin" ? (
          <div className="card">
            <h2>Ончейн чекин (Base Mainnet)</h2>
            <p>
              До следующего чекина: <strong>{formatCountdown(nextCheckInTimer)}</strong>
            </p>
            <p>
              Стоимость чекина: <strong>{EVIL_SQUIRREL_CHECKIN_PRICE_ETH} ETH</strong>
            </p>
            <p>
              Серия чекинов: <strong>{player?.streak ?? 0}</strong>
            </p>
            <p>
              Всего чекинов: <strong>{player?.totalCheckIns ?? 0}</strong>
            </p>
            <button
              type="button"
              onClick={() => void handleCheckIn()}
              disabled={!canCheckInNow || isBusy || !isCorrectChain || !isConnected}
            >
              {isBusy
                ? "Ожидание подтверждения..."
                : canCheckInNow
                  ? "Сделать onchain чекин"
                  : "Чекин скоро будет доступен"}
            </button>
            <small>
              Контракт принимает чек-ин каждые 2 минуты. Каждый успешный чек-ин дает +10% к каждому тапу.
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
