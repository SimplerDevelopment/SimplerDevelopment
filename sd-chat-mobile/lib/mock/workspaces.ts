export type WorkspaceRole = 'owner' | 'member';

export type Workspace = {
  id: string;
  name: string;
  short: string;
  role: WorkspaceRole;
  color: string;
};

export const workspaces: Workspace[] = [
  { id: 'post-captain', name: 'Post Captain Consulting', short: 'PC', role: 'owner', color: '#5B5BD6' },
  { id: 'atlas', name: 'Atlas Collective', short: 'AT', role: 'member', color: '#0A84FF' },
  { id: 'northpoint', name: 'Northpoint Studio', short: 'NP', role: 'member', color: '#30D158' },
  { id: 'acme', name: 'Acme Industries', short: 'AC', role: 'member', color: '#FF9500' },
  { id: 'bramble', name: 'Bramble Co', short: 'BR', role: 'member', color: '#AF52DE' },
];
