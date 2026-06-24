import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "CIEL Textiles Intelligence — Market Intelligence Platform",
  description: "AI-powered market intelligence for apparel brands. Discover, analyze, and qualify brand partnerships with structured intelligence.",
};

import { cookies } from 'next/headers';

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const modelCookie = cookieStore.get('ai_model_preference')?.value as 'ollama' | 'gemini' | undefined;
  const initialModel = modelCookie === 'gemini' ? 'gemini' : 'ollama';

  return (
    <html lang="en">
      <body>
        <div className="app-layout">
          <Sidebar initialModel={initialModel} />
          <main className="main-content">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
