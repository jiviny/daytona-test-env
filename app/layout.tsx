import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Billing Operations Preview — Daytona",
  description:
    "A full-stack Daytona PR preview: Postgres, a Redis queue, a worker, captured email, and a webhook receiver behind one disposable review URL.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
