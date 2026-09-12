import type { ReactNode } from 'react';
import RequireAuth from '../components/RequireAuth';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
