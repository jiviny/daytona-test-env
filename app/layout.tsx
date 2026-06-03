import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Daytona PR Preview Console",
  description:
    "A customer-facing demo of Daytona-backed pull request previews with sandbox URLs, guardrails, and cleanup.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
