import type { Metadata } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
