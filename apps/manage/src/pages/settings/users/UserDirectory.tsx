import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { requestJson } from '../../../api/client';
import { useAuth } from '../../../auth/AuthContext';
import { SettingsFrame } from '../SettingsFrame';

type UserRow = {
  id: string;
  display_name: string;
  email: string;
  role_name: string | null;
  active: number;
  archived_at: string | null;
};

export function UserDirectory() {
  const auth = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let current = true;
    void requestJson<{ items: UserRow[] }>('/identity/users', { authMode: 'session' })
      .then(result => { if (current) setUsers(result.items); })
      .catch(caught => { if (current) setError(String(caught)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, []);
  const query = search.trim().toLowerCase();
  const visible = users.filter(user => `${user.display_name} ${user.email} ${user.role_name || ''}`.toLowerCase().includes(query));

  return <SettingsFrame title="Users"><main className="mx-auto max-w-5xl space-y-5 pb-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-semibold">Users</h1><p className="mt-1 text-sm text-slate-600">Select a user to view or change their details.</p></div>{auth.hasPermission('users.create') && auth.hasPermission('users.manage') && <Link className="rounded border bg-white px-4 py-2 text-sm text-sky-800" to="/settings/users/new">Add user</Link>}</div>
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <label className="block max-w-md text-sm text-slate-700">Search users<input className="mt-1 w-full rounded border bg-white p-2" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Name, email, or role"/></label>
    <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Role</th><th className="p-3">Status</th></tr></thead><tbody>{visible.map(user => <tr key={user.id} className="border-t hover:bg-sky-50"><td className="p-3 font-medium"><Link className="text-sky-800 underline-offset-2 hover:underline" to={`/settings/users/${user.id}`}>{user.display_name}</Link></td><td className="p-3">{user.email}</td><td className="p-3">{user.role_name || 'Not assigned'}</td><td className="p-3">{user.archived_at ? 'Archived' : user.active === 1 ? 'Active' : 'Inactive'}</td></tr>)}</tbody></table>
      {loading && <p className="p-4 text-sm text-slate-600">Loading users…</p>}
      {!loading && visible.length === 0 && !error && <p className="p-4 text-sm text-slate-600">{query ? 'No users match your search.' : 'No users found.'}</p>}
    </div>
  </main></SettingsFrame>;
}
