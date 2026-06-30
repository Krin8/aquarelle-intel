import Link from 'next/link';
import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  
  if (!session || !['Super Administrator', 'System Administrator'].includes(session.role)) {
    redirect('/unauthorized');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside className="w-64 bg-white border-r border-gray-200">
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-900">IAM Console</h1>
        </div>
        <nav className="p-4 space-y-1">
          <Link href="/admin/users" className="block px-3 py-2 rounded-md text-sm font-medium text-gray-900 bg-gray-100">
            User Approvals
          </Link>
          <Link href="/admin/audit" className="block px-3 py-2 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900">
            Audit Logs
          </Link>
          <Link href="/admin/security" className="block px-3 py-2 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900">
            Security Events
          </Link>
          <div className="pt-4 mt-4 border-t border-gray-200">
            <a href="/" className="block px-3 py-2 rounded-md text-sm font-medium text-indigo-600 hover:bg-indigo-50">
              Back to Platform
            </a>
          </div>
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8">
          <h2 className="text-lg font-medium text-gray-900">Administration</h2>
          <div className="text-sm text-gray-500">
            Logged in as {session.email} ({session.role})
          </div>
        </div>
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
