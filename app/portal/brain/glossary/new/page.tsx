'use client';

/**
 * Brain Glossary — create page. Renders the shared `<GlossaryTermForm>` in
 * `create` mode and redirects to the detail page on success.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import GlossaryTermForm from '@/components/brain/GlossaryTermForm';

export default function BrainGlossaryNewPage() {
  const router = useRouter();
  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-5">
      <nav className="text-xs text-muted-foreground flex items-center gap-1">
        <Link href="/portal/brain/glossary" className="hover:text-foreground inline-flex items-center gap-0.5">
          <span className="material-icons text-sm">menu_book</span>
          Glossary
        </Link>
        <span className="material-icons text-sm">chevron_right</span>
        <span>New term</span>
      </nav>

      <header>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <span className="material-icons text-primary">add</span>
          New glossary term
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Define a term once — the canonical answer surfaces wherever AI or your team needs it.
        </p>
      </header>

      <div className="bg-card border border-border rounded-xl p-5">
        <GlossaryTermForm
          mode="create"
          onSaved={(saved) => router.push(`/portal/brain/glossary/${saved.id}`)}
          onCancel={() => router.push('/portal/brain/glossary')}
        />
      </div>
    </div>
  );
}
