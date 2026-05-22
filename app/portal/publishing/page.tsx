import { redirect } from 'next/navigation';

// Index redirect — every Publishing route renders via the sub-routes; the
// index page just lands users on the Board view (default tab).
export default async function PublishingIndexPage() {
  redirect('/portal/publishing/board');
}
