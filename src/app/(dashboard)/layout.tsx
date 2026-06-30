import { Sidebar } from "@/components/Sidebar";
import { cookies } from 'next/headers';

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const modelCookie = cookieStore.get('ai_model_preference')?.value as 'ollama' | 'gemini' | undefined;
  const initialModel = modelCookie === 'gemini' ? 'gemini' : 'ollama';

  return (
    <div className="app-layout">
      <Sidebar initialModel={initialModel} />
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
