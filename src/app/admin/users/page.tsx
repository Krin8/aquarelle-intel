import prisma from '@/lib/db';
import { approveUser, rejectUser, suspendUser, assignRole } from '@/actions/admin-actions';

export default async function AdminUsersPage() {
  const users = await prisma.user.findMany({
    orderBy: [
      { status: 'asc' }, // 'pending' comes first
      { createdAt: 'desc' }
    ]
  });

  return (
    <div>
      <div className="mb-8">
        <h3 className="text-2xl font-bold text-gray-900">User Identity & Access Management</h3>
        <p className="mt-1 text-sm text-gray-500">
          Review pending registration requests and manage role-based access control.
        </p>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department / Role</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Justification</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.map((user) => (
              <tr key={user.id} className={user.status === 'pending' ? 'bg-yellow-50' : ''}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10 bg-indigo-100 rounded-full flex items-center justify-center">
                      <span className="text-indigo-800 font-medium">{user.fullName.charAt(0)}</span>
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">{user.fullName}</div>
                      <div className="text-sm text-gray-500">{user.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{user.department || 'N/A'} - {user.jobTitle}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    <form action={async (formData) => {
                      'use server';
                      await assignRole(user.id, formData.get('role') as string);
                    }}>
                      <select 
                        name="role" 
                        defaultValue={user.role}
                        className="mt-1 block w-full py-1 px-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-xs"
                        onChange={(e) => e.target.form?.requestSubmit()}
                      >
                        <option value="Super Administrator">Super Administrator</option>
                        <option value="System Administrator">System Administrator</option>
                        <option value="Sales Director">Sales Director</option>
                        <option value="Sales Manager">Sales Manager</option>
                        <option value="Business Development Executive">Business Development Executive</option>
                        <option value="Market Intelligence Analyst">Market Intelligence Analyst</option>
                        <option value="Buyer Intelligence Analyst">Buyer Intelligence Analyst</option>
                        <option value="Guest">Guest</option>
                      </select>
                    </form>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-gray-900 truncate max-w-xs" title={user.businessJustification || ''}>
                    {user.businessJustification || 'No justification provided'}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                    ${user.status === 'approved' ? 'bg-green-100 text-green-800' : 
                      user.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 
                      'bg-red-100 text-red-800'}`}>
                    {user.status.toUpperCase()}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                  {user.status === 'pending' && (
                    <>
                      <form action={approveUser.bind(null, user.id)} className="inline">
                        <button className="text-indigo-600 hover:text-indigo-900">Approve</button>
                      </form>
                      <form action={rejectUser.bind(null, user.id)} className="inline">
                        <button className="text-red-600 hover:text-red-900">Reject</button>
                      </form>
                    </>
                  )}
                  {user.status === 'approved' && (
                    <form action={suspendUser.bind(null, user.id)} className="inline">
                      <button className="text-red-600 hover:text-red-900">Suspend</button>
                    </form>
                  )}
                  {user.status === 'suspended' && (
                    <form action={approveUser.bind(null, user.id)} className="inline">
                      <button className="text-indigo-600 hover:text-indigo-900">Unsuspend</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                  No users found in the system.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
