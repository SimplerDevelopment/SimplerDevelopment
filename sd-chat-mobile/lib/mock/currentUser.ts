export type CurrentUser = {
  id: number;
  name: string;
  email: string;
  avatarId: number;
  workspaceId: string;
};

export const currentUser: CurrentUser = {
  id: 7,
  name: 'Demo User',
  email: 'demo@example.com',
  avatarId: 7,
  workspaceId: 'demo-workspace',
};
