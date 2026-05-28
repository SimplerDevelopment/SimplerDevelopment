export const dynamic = 'force-dynamic';

// Tags shell — PUB-7 replaces this with the polymorphic tag-taxonomy admin
// over the (about-to-be) polymorphic taggings table.
export default function PublishingTagsPage() {
  return (
    <section className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center">
      <span className="material-symbols-outlined text-4xl text-gray-400">sell</span>
      <h2 className="mt-2 text-lg font-medium">Tags</h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        PUB-7 will manage cross-channel tags here.
      </p>
    </section>
  );
}
