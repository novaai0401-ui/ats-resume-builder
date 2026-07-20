import { Suspense } from 'react';
import ResumeStartClient from './ResumeStartClient';

export const dynamic = 'force-dynamic';

// Guest resume drafting: /resume/start is usable without a token so a
// visitor can try the builder before signing up. Template query params
// (?template=<id>) carry into the guest draft via the editor.
export default function ResumeStartPage() {
  return (
    <Suspense fallback={<div className="card">Loading resume start...</div>}>
      <ResumeStartClient />
    </Suspense>
  );
}
