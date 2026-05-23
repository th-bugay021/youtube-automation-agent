'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

const API = process.env.NEXT_PUBLIC_API_URL;

export default function SettingsPage() {
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: async () => (await api.get('/users/me')).data,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted">Account and connection management.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <div className="text-sm">
          <div><span className="text-muted">Email: </span>{me?.email}</div>
          <div><span className="text-muted">Name: </span>{me?.name ?? '—'}</div>
          <div><span className="text-muted">Role: </span>{me?.role}</div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Link another YouTube channel</CardTitle>
        </CardHeader>
        <p className="mb-3 text-sm text-muted">
          Re-running the Google flow will add any new channels your account owns and refresh
          stored credentials for existing ones.
        </p>
        <a href={`${API}/api/auth/google`}>
          <Button>Connect Google</Button>
        </a>
      </Card>
    </div>
  );
}
