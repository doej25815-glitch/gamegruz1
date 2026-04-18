import { PropsWithChildren } from "react";

export function SafeArea({ children }: PropsWithChildren) {
  return <div style={{ padding: "max(12px, env(safe-area-inset-top)) 12px 12px" }}>{children}</div>;
}
