import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from 'octokit';

function getAppOctokit() {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = Buffer.from(process.env.GITHUB_APP_PRIVATE_KEY || '', 'base64').toString('utf-8');
  const installationId = parseInt(process.env.GITHUB_APP_INSTALLATION_ID || '0', 10);

  if (!appId || !privateKey || !installationId) {
    throw new Error('Missing GitHub App environment variables (GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_INSTALLATION_ID)');
  }

  return new Octokit({
    authStrategy: createAppAuth,
    auth: { appId, privateKey, installationId },
  });
}

/**
 * Create a new repo from the template repo under the simplerdevelopment org.
 */
export async function createRepoFromTemplate(
  newRepoName: string,
  description: string,
): Promise<{ fullName: string; htmlUrl: string; cloneUrl: string }> {
  const octokit = getAppOctokit();
  const templateRepo = process.env.GITHUB_TEMPLATE_REPO || 'simplerdevelopment/website-starter';
  const [templateOwner, templateName] = templateRepo.split('/');

  const { data } = await octokit.rest.repos.createUsingTemplate({
    template_owner: templateOwner,
    template_repo: templateName,
    owner: 'simplerdevelopment',
    name: newRepoName,
    description,
    private: true,
    include_all_branches: false,
  });

  return {
    fullName: data.full_name,
    htmlUrl: data.html_url,
    cloneUrl: data.clone_url,
  };
}

/**
 * Add a GitHub user as a collaborator on a repo.
 */
export async function addCollaborator(
  repoFullName: string,
  githubUsername: string,
  permission: 'pull' | 'push' | 'admin' = 'push',
): Promise<void> {
  const octokit = getAppOctokit();
  const [owner, repo] = repoFullName.split('/');

  await octokit.rest.repos.addCollaborator({
    owner,
    repo,
    username: githubUsername,
    permission,
  });
}

/**
 * Remove a collaborator from a repo.
 */
export async function removeCollaborator(
  repoFullName: string,
  githubUsername: string,
): Promise<void> {
  const octokit = getAppOctokit();
  const [owner, repo] = repoFullName.split('/');

  await octokit.rest.repos.removeCollaborator({
    owner,
    repo,
    username: githubUsername,
  });
}

/**
 * Check if a repo name is available in the org.
 */
export async function isRepoNameAvailable(repoName: string): Promise<boolean> {
  const octokit = getAppOctokit();
  try {
    await octokit.rest.repos.get({ owner: 'simplerdevelopment', repo: repoName });
    return false; // exists
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) return true;
    throw err;
  }
}
