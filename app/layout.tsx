import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vercelab",
  description:
    "Internal homelab deployment control plane for Docker and Traefik.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="h-screen overflow-hidden bg-white text-sm text-zinc-900">
        {children}
      </body>
    </html>
  );
}
