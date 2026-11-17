
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AUREVEX | Trading Demo",
  description: "AUREVEX virtual trading platform. Practice trading with demo funds."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
