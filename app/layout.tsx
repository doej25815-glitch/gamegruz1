import type { Metadata } from "next";
import "./globals.css";
import { RootProvider } from "./rootProvider";

export const metadata: Metadata = {
  title: "gamegruz1",
  description: "Clean Base mini app scaffold",
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
