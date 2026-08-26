'use client';

import { useState } from 'react';
import GenerateSurveyModal from './GenerateSurveyModal';
import { pBtnGhost } from '@/components/portal/portal-ui';

interface ProjectSurveyActionProps {
  projectId: number;
}

/**
 * Header trigger + modal for "Generate survey" (PUX-033 step 4).
 *
 * app/portal/projects/[id]/[[...card]]/page.tsx is a Server Component
 * (auth()/db calls at module scope, no 'use client'), so it cannot itself
 * hold `useState` for the modal's open/close boolean. This tiny client
 * component owns that state the same way ProjectStatusControl owns its own
 * state beside it in the header actions row — the page renders this as a
 * single import + one line, matching the pattern already used for every
 * other header action here.
 */
export default function ProjectSurveyAction({ projectId }: ProjectSurveyActionProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={pBtnGhost}>
        <span className="material-icons text-base">poll</span>
        Generate survey
      </button>
      {/* Mount only while open — matches CrmAddDealModal's pattern, and gives
          GenerateSurveyModal a fresh mount (fresh state) on every open. */}
      {open && <GenerateSurveyModal projectId={projectId} open={open} onClose={() => setOpen(false)} />}
    </>
  );
}
