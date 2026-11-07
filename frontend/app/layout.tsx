import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";


export const metadata: Metadata = {
  title: "Maintenance API Console",
  description: "Test the Maintenance Team 10 API",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="font-sans">
      <body>{children}</body>
    </html>
  );
}
