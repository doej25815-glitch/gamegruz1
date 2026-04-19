import type { Metadata } from "next";
import "./globals.css";
import { RootProvider } from "./rootProvider";

export const metadata: Metadata = {
  title: "gamegruz1",
  description: "Clean Base mini app scaffold",
  other: {
    "base:app_id": "69e4837986272d70f28d742c",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
