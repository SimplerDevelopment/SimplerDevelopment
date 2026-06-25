export type CurrentUser = {
  id: number;
  name: string;
  email: string;
  avatarId: number;
  workspaceId: string;
};

export const currentUser: CurrentUser = {
  id: 7,
  name: 'Daniel Coyle',
  email: 'daniel@postcaptain.com',
  avatarId: 7,
  workspaceId: 'post-captain',
};
