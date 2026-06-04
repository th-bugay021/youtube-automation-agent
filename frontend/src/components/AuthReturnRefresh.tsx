'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

export function AuthReturnRefresh() {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (params.get('auth') !== 'google' || params.get('sync') !== 'channels') return;

    void queryClient.invalidateQueries({ queryKey: ['me'] });
    void queryClient.invalidateQueries({ queryKey: ['channels'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });

    const nextParams = new URLSearchParams(params.toString());
    nextParams.delete('auth');
    nextParams.delete('sync');
    const next = nextParams.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [params, pathname, queryClient, router]);

  return null;
}
