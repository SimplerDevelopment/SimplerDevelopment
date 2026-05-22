export const dynamic = 'force-dynamic';

// Campaigns shell — PUB-6 replaces this with the list + CRUD UI over the
// publishing_campaigns table.
export default function PublishingCampaignsPage() {
  return (
    <section className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center">
      <span className="material-symbols-outlined text-4xl text-gray-400">campaign</span>
      <h2 className="mt-2 text-lg font-medium">Campaigns</h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        PUB-6 will manage cross-channel campaigns here.
      </p>
    </section>
  );
}
