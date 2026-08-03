import type { Metadata } from "next";
import "./globals.css";
import { RevealProvider } from "@/components/RevealProvider";

export const metadata: Metadata = {
  title: "Olutoju | Autonomous DeFi position guardian",
  description:
    "Olutoju watches your DeFi positions and acts the moment they're at risk — simulated, signed, and settled via KeeperHub.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600;700&family=Space+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <RevealProvider>{children}</RevealProvider>
      </body>
    </html>
  );
}