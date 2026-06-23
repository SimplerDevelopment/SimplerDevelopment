// Pure greedy sprint-proposal logic. Takes a prioritized backlog + a target
// point capacity and returns a packing proposal an AI agent (or human) can
// review. Kept DB-free so it can be unit-tested without DATABASE_URL.

export interface BacklogCardInput {
  id: number;
  number: number | null;
  title: string;
  storyPoints: number | null;
  cardType: string | null;
  /** Card ids that block this one (unresolved blockers — already filtered to "not done"). */
  blockerCardIds: number[];
}

export interface ProposalCard {
  id: number;
  number: number | null;
  title: string;
  storyPoints: number;
  cardType: string;
  blockerCardIds: number[];
}

export interface SprintProposal {
  recommended: ProposalCard[];
  /** Cards skipped because adding them would exceed targetPoints. */
  skipped: ProposalCard[];
  /** Cards excluded because they have unresolved blockers in this sprint window. */
  blocked: ProposalCard[];
  /** Cards excluded because they have no story-point estimate. */
  unsized: BacklogCardInput[];
  totalPoints: number;
  targetPoints: number;
  utilization: number; // totalPoints / targetPoints, rounded to 2 decimals
  warnings: string[];
}

export interface ProposalOptions {
  /** Hard cap on points to commit. If null, defaults to 1.1× velocityBaseline. */
  targetPoints?: number | null;
  /** Recent average completed-points velocity. Used as default if targetPoints is null. */
  velocityBaseline?: number | null;
  /** Optional: ids of cards that must be included (the user pre-pinned them). */
  requireCardIds?: number[];
}

export function computeSprintProposal(
  backlog: BacklogCardInput[],
  opts: ProposalOptions = {},
): SprintProposal {
  const required = new Set(opts.requireCardIds ?? []);
  const baseline = opts.velocityBaseline ?? 0;
  // Default capacity: 1.1× recent velocity (a small stretch). Floors at 1 so an
  // empty velocity history still produces a non-zero capacity for the user to
  // adjust against.
  const target = opts.targetPoints != null
    ? Math.max(0, Math.round(opts.targetPoints))
    : Math.max(1, Math.ceil(baseline * 1.1));

  const recommended: ProposalCard[] = [];
  const skipped: ProposalCard[] = [];
  const blocked: ProposalCard[] = [];
  const unsized: BacklogCardInput[] = [];
  const warnings: string[] = [];

  let total = 0;

  for (const card of backlog) {
    if (card.storyPoints == null) {
      unsized.push(card);
      continue;
    }
    const proposal: ProposalCard = {
      id: card.id,
      number: card.number,
      title: card.title,
      storyPoints: card.storyPoints,
      cardType: card.cardType ?? 'task',
      blockerCardIds: card.blockerCardIds,
    };
    const isRequired = required.has(card.id);

    if (card.blockerCardIds.length > 0 && !isRequired) {
      blocked.push(proposal);
      continue;
    }

    if (total + card.storyPoints > target && !isRequired) {
      skipped.push(proposal);
      continue;
    }

    recommended.push(proposal);
    total += card.storyPoints;
  }

  if (unsized.length > 0) {
    warnings.push(`${unsized.length} backlog card${unsized.length === 1 ? '' : 's'} unsized — pull them in only if you can size them during planning.`);
  }
  if (blocked.length > 0) {
    warnings.push(`${blocked.length} backlog card${blocked.length === 1 ? '' : 's'} blocked by unfinished work — resolve dependencies first.`);
  }
  if (baseline > 0 && target > baseline * 1.5) {
    warnings.push(`Target ${target} pts is more than 1.5× recent velocity (${Math.round(baseline)}); consider trimming.`);
  }
  if (recommended.length === 0 && backlog.length > 0) {
    warnings.push('No cards fit the target — try raising it or sizing backlog cards.');
  }

  const utilization = target === 0 ? 0 : Math.round((total / target) * 100) / 100;

  return {
    recommended,
    skipped,
    blocked,
    unsized,
    totalPoints: total,
    targetPoints: target,
    utilization,
    warnings,
  };
}
