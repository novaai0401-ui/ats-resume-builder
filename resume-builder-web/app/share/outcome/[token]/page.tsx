'use client';

// Public share route — intentionally NOT wrapped in AuthGate so anyone with
// the link can view the anonymized card. Uses useParams to read the token,
// which sidesteps the sync/async `params` differences across Next versions.

import { useParams } from 'next/navigation';
import ShareCardView from './ShareCardView';

export default function ShareOutcomePage() {
  const params = useParams<{ token: string }>();
  const token = Array.isArray(params?.token) ? params.token[0] : (params?.token ?? '');
  return <ShareCardView token={token} />;
}
