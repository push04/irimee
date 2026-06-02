import { Dashboard } from '@/components/dashboard';

/**
 * app/page.tsx — Authenticated dashboard entry point.
 * Protected by middleware.ts — only reachable with a valid Supabase session.
 * The Dashboard component renders its own full-screen layout including TopBar.
 */
export default function Home() {
  return <Dashboard />;
}
