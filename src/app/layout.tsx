import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aquarelle Intelligence — Market Intelligence Platform",
  description: "AI-powered market intelligence for apparel brands. Discover, analyze, and qualify brand partnerships with structured intelligence.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen text-[var(--text-primary)] bg-[var(--bg-primary)]">
        {children}
      </body>
    </html>
  );
}
