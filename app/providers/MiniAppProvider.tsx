"use client";

import { PropsWithChildren, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import sdk from "@farcaster/miniapp-sdk";
import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";
import { WagmiProvider, createConfig, http } from "wagmi";
import { baseAccount, injected } from "wagmi/connectors";
import { base } from "wagmi/chains";

const config = createConfig({
  chains: [base],
  connectors: [
    injected({ target: "rabby" }),
    injected({ target: "metaMask" }),
    injected(),
    baseAccount({
      appName: "Evil Squirrel Tap",
    }),
    farcasterMiniApp(),
  ],
  transports: {
    [base.id]: http(),
  },
});

const queryClient = new QueryClient();

export function MiniAppProvider({ children }: PropsWithChildren) {
  useEffect(() => {
    sdk.actions.ready().catch(() => {
      // Safe no-op when the app is opened outside a Mini App host.
    });
  }, []);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
