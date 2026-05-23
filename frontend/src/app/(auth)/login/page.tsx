'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Sparkles } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-2xl bg-brand/15 text-brand">
          <Sparkles className="size-6" />
        </div>
        <h1 className="text-2xl font-semibold">YouTube Automation</h1>
        <p className="mt-2 text-sm text-muted">
          Sign in with Google to link your YouTube channels and start automating.
        </p>
        <a href={`${API}/api/auth/google`} className="mt-6 block">
          <Button className="w-full" size="lg">Continue with Google</Button>
        </a>
        <p className="mt-6 text-xs text-muted">
          We request only the YouTube scopes needed to read your analytics and publish videos you
          approve.
        </p>
      </Card>
    </div>
  );
}
