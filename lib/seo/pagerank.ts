// Internal link authority. Standard power-iteration PageRank over the
// crawled internal link graph — not Google's actual algorithm (that's
// proprietary and uses the full web graph), but the same primitive every
// SEO tool uses as a proxy for "how deep is this page in the site's own
// link structure."

export type PageRankEdge = { from: number; to: number };

export type PageRankOptions = {
  damping?: number;
  iterations?: number;
};

export function computePageRank(
  nodeIds: number[],
  edges: PageRankEdge[],
  opts: PageRankOptions = {}
): Map<number, number> {
  const damping = opts.damping ?? 0.85;
  const iterations = opts.iterations ?? 30;

  const nodes = [...new Set(nodeIds)];
  const n = nodes.length;
  if (n === 0) return new Map();

  const nodeSet = new Set(nodes);
  // Set per source collapses duplicate edges for free.
  const outLinks = new Map<number, Set<number>>();
  for (const id of nodes) outLinks.set(id, new Set());

  for (const { from, to } of edges) {
    if (from === to) continue; // self-loop
    if (!nodeSet.has(from) || !nodeSet.has(to)) continue; // unknown node
    outLinks.get(from)!.add(to);
  }

  const inLinks = new Map<number, number[]>();
  for (const id of nodes) inLinks.set(id, []);
  for (const [from, tos] of outLinks) {
    for (const to of tos) inLinks.get(to)!.push(from);
  }

  const outDegree = new Map<number, number>();
  for (const [id, tos] of outLinks) outDegree.set(id, tos.size);

  let rank = new Map<number, number>();
  for (const id of nodes) rank.set(id, 1 / n);

  for (let iter = 0; iter < iterations; iter++) {
    // Dangling nodes (no outlinks) would otherwise leak their mass out of
    // the system each pass; redistributing it evenly is what keeps total
    // rank conserved at ~1 across iterations.
    let danglingMass = 0;
    for (const id of nodes) {
      if (outDegree.get(id) === 0) danglingMass += rank.get(id)!;
    }
    const teleport = (1 - damping) / n + (damping * danglingMass) / n;

    const next = new Map<number, number>();
    for (const id of nodes) {
      let incoming = 0;
      for (const src of inLinks.get(id)!) {
        incoming += rank.get(src)! / outDegree.get(src)!;
      }
      next.set(id, teleport + damping * incoming);
    }
    rank = next;
  }

  return rank;
}

export type LinkMetrics = {
  internalRank: number;
  incomingLinks: number;
  orphan: boolean;
};

export function deriveLinkMetrics(
  pages: { id: number; depth: number }[],
  internalEdges: PageRankEdge[]
): Map<number, LinkMetrics> {
  const nodeIds = pages.map(p => p.id);
  const ranks = computePageRank(nodeIds, internalEdges);

  const nodeSet = new Set(nodeIds);
  const incomingSources = new Map<number, Set<number>>();
  for (const id of nodeIds) incomingSources.set(id, new Set());
  for (const { from, to } of internalEdges) {
    if (from === to) continue;
    if (!nodeSet.has(from) || !nodeSet.has(to)) continue;
    incomingSources.get(to)!.add(from);
  }

  const result = new Map<number, LinkMetrics>();
  for (const page of pages) {
    const incomingLinks = incomingSources.get(page.id)?.size ?? 0;
    result.set(page.id, {
      internalRank: ranks.get(page.id) ?? 0,
      incomingLinks,
      orphan: incomingLinks === 0 && page.depth > 0,
    });
  }
  return result;
}
