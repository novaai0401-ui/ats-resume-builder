import { Suspense } from 'react';
import AuthGate from '@/src/components/AuthGate';
import TemplateSelectionView from './TemplateSelectionView';

export const dynamic = 'force-dynamic';

export default function TemplateSelectionPage() {
  return (
    <AuthGate>
      <Suspense fallback={<main className="grid template-grid-layout"><section className="card col-7"><div className="skeleton skeleton-text--wide" style={{ height: 20, marginBottom: 12 }} /><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>{[1, 2, 3, 4].map((i) => (<div key={i} className="skeleton-card"><div className="skeleton skeleton-card__preview" /><div><div className="skeleton skeleton-card__line" style={{ width: '60%' }} /><div className="skeleton skeleton-card__line" style={{ width: '40%' }} /></div></div>))}</div></section><section className="card col-5"><div className="skeleton skeleton-preview-pane" /></section></main>}>
        <TemplateSelectionView />
      </Suspense>
    </AuthGate>
  );
}
