import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./workspace.css";
import "./dashboard.css";
import "./request-cards.css";


export const metadata: Metadata = {
  title: "MFU Campus Maintenance",
  description: "Report campus repairs, follow work-order updates, and manage facility maintenance at Mae Fah Luang University.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="font-sans">
      <body>{children}</body>
    </html>
  );
}
