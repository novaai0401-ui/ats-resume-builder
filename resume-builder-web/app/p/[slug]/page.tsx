'use client';

import { useParams } from 'next/navigation';
import PublicPortfolioView from './PublicPortfolioView';

export default function PublicPortfolioPage() {
  const params = useParams<{ slug: string }>();
  const slug = Array.isArray(params?.slug) ? params.slug[0] : (params?.slug ?? '');
  return <PublicPortfolioView slug={slug} />;
}
