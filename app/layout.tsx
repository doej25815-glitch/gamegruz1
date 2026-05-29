import type { Metadata } from "next";
import "./globals.css";
import { RootProvider } from "./rootProvider";

export const metadata: Metadata = {
  title: "gamegruz1",
  description: "Clean Base mini app scaffold",
  other: {
    "base:app_id": "69e4837986272d70f28d742c",
    "talentapp:project_verification" "8c0c60650ba574b09bb9b4a820d6c6898c3d4626c3904fe77b30651395d0c04c63a4eb3737b1d4e96a187faec188b95cc1f8bc30037193d86f0fbfdb4d7497f2"
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
