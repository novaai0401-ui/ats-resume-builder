'use client';

import { useState } from 'react';
import { TkxButton, TkxInput, TkxSelect } from 'tekivex-ui';
import { api } from '@/src/lib/api';
import { SUPPORT_EMAIL } from '@/src/lib/support';

/**
 * R-073 self-serve recovery: "I paid but never got my download."
 * The signed-in user enters their resume name and/or payment ID; if we
 * find a completed payment for that resume on their account, we email the
 * resume straight from the database to their account address — no support
 * agent, no re-charge.
 */
export function PaidResumeRecoveryForm() {
  const [resumeName, setResumeName] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [format, setFormat] = useState<'pdf' | 'docx'>('pdf');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const canSubmit = (resumeName.trim() || paymentId.trim()) && status !== 'sending';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus('sending');
    setMessage('');
    try {
      const res = await api.emailPaidResumeCopy({
        resumeName: resumeName.trim() || undefined,
        paymentId: paymentId.trim() || undefined,
        format,
      });
      if (res.sent) {
        setStatus('sent');
        setMessage(`Sent! Your resume is on its way to ${res.to}. Check your inbox and spam folder.`);
      } else {
        setStatus('error');
        setMessage(`We couldn't send the email just now. Please email ${SUPPORT_EMAIL} and we'll sort it out.`);
      }
    } catch (err: unknown) {
      setStatus('error');
      const detail =
        err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : '';
      setMessage(
        detail ||
          `We couldn't find a completed payment for that resume. Double-check the name/ID, or email ${SUPPORT_EMAIL} with your payment ID.`,
      );
    }
  }

  return (
    <form onSubmit={onSubmit} className="card" style={{ padding: 16, display: 'grid', gap: 10 }}>
      <div>
        <strong style={{ fontSize: 14 }}>Paid but didn&apos;t get your download?</strong>
        <p className="small" style={{ color: 'var(--muted)', margin: '4px 0 0' }}>
          Enter your resume name or your payment ID and we&apos;ll email the resume you paid for
          straight to your account address. No extra charge.
        </p>
      </div>
      <TkxInput label="Resume name"
          type="text"
          value={resumeName}
          onChange={(e) => setResumeName(e.target.value)}
          placeholder="e.g. Software Engineer resume"
         
        />
      <TkxInput label="Payment ID (optional)"
          type="text"
          value={paymentId}
          onChange={(e) => setPaymentId(e.target.value)}
          placeholder="pay_XXXXXXXX or order id"
         
        />
      <TkxSelect
        label="Format"
        value={format}
        options={[
          { value: 'pdf', label: 'PDF' },
          { value: 'docx', label: 'Word (.docx)' },
        ]}
        onChange={(value) => setFormat(String(value || '') as 'pdf' | 'docx')}
      />
      <TkxButton type="submit" disabled={!canSubmit}>
        {status === 'sending' ? 'Sending…' : 'Email me my resume'}
      </TkxButton>
      {message && (
        <p
          className="small"
          role="status"
          style={{ margin: 0, color: status === 'sent' ? 'var(--success, #158a4b)' : 'var(--danger, #b42318)' }}
        >
          {message}
        </p>
      )}
    </form>
  );
}
