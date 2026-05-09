'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';
import { useAppSelector } from '@/store/hooks';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Shield, ShieldOff, UserCheck, UserX } from 'lucide-react';

const ROLE_BADGE: Record<string, string> = {
    STUDENT: 'bg-blue-50 text-blue-700',
    INSTRUCTOR: 'bg-purple-50 text-purple-700',
    ADMIN: 'bg-red-50 text-red-700',
};

export default function AdminUsersPage() {
    const router = useRouter();
    const user = useAppSelector(s => s.auth.user);
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (user !== undefined && user?.role !== 'ADMIN') { router.push('/dashboard'); return; }
        if (user?.role === 'ADMIN') {
            adminApi.users().then(r => setUsers(r.data)).catch(() => toast.error('Failed to load users')).finally(() => setLoading(false));
        }
    }, [user, router]);

    const handleSearch = () => {
        adminApi.users({ search }).then(r => setUsers(r.data)).catch(() => {});
    };

    const handleChangeRole = async (userId: string, role: string) => {
        try {
            await adminApi.changeRole(userId, role);
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
            toast.success('Role updated');
        } catch { toast.error('Failed to change role'); }
    };

    const handleBan = async (userId: string, isBanned: boolean) => {
        try {
            if (isBanned) {
                await adminApi.unbanUser(userId);
                setUsers(prev => prev.map(u => u.id === userId ? { ...u, isBanned: false } : u));
                toast.success('User unbanned');
            } else {
                await adminApi.banUser(userId);
                setUsers(prev => prev.map(u => u.id === userId ? { ...u, isBanned: true } : u));
                toast.success('User banned');
            }
        } catch { toast.error('Action failed'); }
    };

    if (loading) return <div className="flex justify-center items-center min-h-[60vh]"><p className="text-gray-500">Loading...</p></div>;

    return (
        <div className="container mx-auto px-4 py-8 max-w-6xl">
            <h1 className="text-2xl font-bold mb-6">User Management</h1>
            <div className="flex gap-3 mb-6">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                        className="pl-9"
                        placeholder="Search by name or email..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                    />
                </div>
                <Button onClick={handleSearch} variant="outline">Search</Button>
            </div>
            <div className="bg-white border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b bg-gray-50">
                            <th className="text-left px-4 py-3 font-medium text-gray-500">User</th>
                            <th className="text-left px-4 py-3 font-medium text-gray-500">Role</th>
                            <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                            <th className="text-left px-4 py-3 font-medium text-gray-500">Joined</th>
                            <th className="text-right px-4 py-3 font-medium text-gray-500">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {users.map((u: any) => (
                            <tr key={u.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3">
                                    <p className="font-medium">{u.name}</p>
                                    <p className="text-xs text-gray-400">{u.email}</p>
                                </td>
                                <td className="px-4 py-3">
                                    <select
                                        value={u.role}
                                        onChange={e => handleChangeRole(u.id, e.target.value)}
                                        className={`text-xs px-2 py-1 rounded-full border-0 font-medium focus:outline-none ${ROLE_BADGE[u.role] ?? 'bg-gray-50 text-gray-600'}`}
                                    >
                                        <option value="STUDENT">STUDENT</option>
                                        <option value="INSTRUCTOR">INSTRUCTOR</option>
                                        <option value="ADMIN">ADMIN</option>
                                    </select>
                                </td>
                                <td className="px-4 py-3">
                                    {u.isBanned
                                        ? <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">Banned</span>
                                        : u.isVerified
                                            ? <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full">Verified</span>
                                            : <span className="text-xs bg-yellow-50 text-yellow-600 px-2 py-0.5 rounded-full">Unverified</span>}
                                </td>
                                <td className="px-4 py-3 text-gray-400 text-xs">
                                    {new Date(u.createdAt).toLocaleDateString()}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleBan(u.id, u.isBanned)}
                                        className={u.isBanned ? 'text-green-600' : 'text-red-500'}
                                    >
                                        {u.isBanned ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {users.length === 0 && (
                    <p className="text-center text-gray-400 py-12">No users found</p>
                )}
            </div>
        </div>
    );
}
