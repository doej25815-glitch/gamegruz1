"use client";

import { PropsWithChildren } from "react";
import { Providers } from "./providers";

export function RootProvider({ children }: PropsWithChildren) {
  return <Providers>{children}</Providers>;
}
