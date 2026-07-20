import { Suspense } from 'react';
import ResumeEditor from './ResumeEditor';

export const dynamic = 'force-dynamic';

// Guest resume drafting: the editor is intentionally NOT wrapped in
// AuthGate. Anonymous visitors draft locally (rb_guest_draft in
// localStorage); account-only actions are gated inside the editor.
export default function ResumePage() {
  return (
    <>
      <Suspense fallback={<main className="grid"><section className="card col-12"><div className="skeleton skeleton-text--wide" style={{ height: 24, marginBottom: 16 }} /><div className="skeleton-editor-section"><div className="skeleton skeleton-editor-field" style={{ width: '40%' }} /><div className="skeleton skeleton-editor-field" /><div className="skeleton skeleton-editor-field" style={{ width: '70%' }} /></div><div className="skeleton-editor-section"><div className="skeleton skeleton-editor-field" style={{ width: '30%' }} /><div className="skeleton skeleton-editor-field" /><div className="skeleton skeleton-editor-field" style={{ width: '50%' }} /><div className="skeleton skeleton-editor-field" /></div></section></main>}>
        <ResumeEditor />
      </Suspense>
    </>
  );
}
