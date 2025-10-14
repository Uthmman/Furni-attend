

'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function DashboardRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/payroll');
  }, [router]);

  return null;
}
    
