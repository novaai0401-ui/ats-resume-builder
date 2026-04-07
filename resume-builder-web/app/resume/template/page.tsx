import { Suspense } from 'react';
import { TkxSkeleton } from 'tekivex-ui';
import TemplateSelectionView from './TemplateSelectionView';

export const dynamic = 'force-dynamic';

function TemplatePageFallback() {
  return (
    <main className="grid template-grid-layout">
      <section className="card col-7">
        <TkxSkeleton variant="text" width="50%" animation="wave" style={{ marginBottom: 12 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ border: '1px solid #d9e3ec', borderRadius: 16, padding: 12, display: 'grid', gap: 10 }}>
              <TkxSkeleton variant="rectangular" width="100%" animation="wave" style={{ aspectRatio: '794 / 1123', borderRadius: 12 }} />
              <div>
                <TkxSkeleton variant="text" width="60%" animation="wave" style={{ marginBottom: 6 }} />
                <TkxSkeleton variant="text" width="40%" animation="wave" />
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="card col-5">
        <TkxSkeleton variant="rectangular" width="100%" animation="wave" style={{ aspectRatio: '794 / 1123', borderRadius: 12, minHeight: 300 }} />
      </section>
    </main>
  );
}

export default function TemplateSelectionPage() {
  return (
    <Suspense fallback={<TemplatePageFallback />}>
      <TemplateSelectionView />
    </Suspense>
  );
}
