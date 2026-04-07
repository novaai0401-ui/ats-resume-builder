import { Suspense } from 'react';
import { TkxSkeleton } from 'tekivex-ui';
import ResumeEditor from './ResumeEditor';

export const dynamic = 'force-dynamic';

function ResumePageFallback() {
  return (
    <main className="grid">
      <section className="card col-12">
        <TkxSkeleton variant="text" width="40%" animation="wave" style={{ height: 24, marginBottom: 16 }} />
        <div style={{ border: '1px solid #d9e3ec', borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <TkxSkeleton variant="text" width="40%" animation="wave" style={{ marginBottom: 12 }} />
          <TkxSkeleton variant="rectangular" width="100%" height={36} animation="wave" style={{ borderRadius: 8, marginBottom: 12 }} />
          <TkxSkeleton variant="rectangular" width="100%" height={36} animation="wave" style={{ borderRadius: 8, marginBottom: 12 }} />
          <TkxSkeleton variant="rectangular" width="70%" height={36} animation="wave" style={{ borderRadius: 8 }} />
        </div>
        <div style={{ border: '1px solid #d9e3ec', borderRadius: 14, padding: 16 }}>
          <TkxSkeleton variant="text" width="30%" animation="wave" style={{ marginBottom: 12 }} />
          <TkxSkeleton variant="rectangular" width="100%" height={36} animation="wave" style={{ borderRadius: 8, marginBottom: 12 }} />
          <TkxSkeleton variant="rectangular" width="100%" height={36} animation="wave" style={{ borderRadius: 8, marginBottom: 12 }} />
          <TkxSkeleton variant="rectangular" width="50%" height={36} animation="wave" style={{ borderRadius: 8, marginBottom: 12 }} />
          <TkxSkeleton variant="rectangular" width="100%" height={36} animation="wave" style={{ borderRadius: 8 }} />
        </div>
      </section>
    </main>
  );
}

export default function ResumePage() {
  return (
    <Suspense fallback={<ResumePageFallback />}>
      <ResumeEditor />
    </Suspense>
  );
}
