import { redirect } from 'next/navigation';

// The marketing homepage and external links point at /templates, but
// the actual gallery lives under /templates/preview. This redirect
// keeps every existing link, sitemap entry, and bookmark working
// without having to chase down each call site.
export default function TemplatesIndex() {
  redirect('/templates/preview');
}
