import { getAppConfig } from '@/lib/app-config';
import { jsonDevError } from '@/lib/dev-api';
import { enqueueDevDeployment } from '@/lib/dev-engine';
import { getDevProjectDetailById } from '@/lib/dev-persistence';
import {
  getWebhookBranchRef,
  getWebhookCommit,
  getWebhookRepositoryFullName,
  parseGitHubPushPayload,
  verifyGitHubWebhookSignature,
} from '@/lib/dev-webhook';
import { getGitHubCommit, parseGitHubRepositoryReference } from '@/lib/github';

export const dynamic = 'force-dynamic';

type DevWebhookContext = {
  params: Promise<{
    projectId: string;
  }>;
};

export async function POST(request: Request, { params }: DevWebhookContext) {
  const { projectId } = await params;

  try {
    const project = await getDevProjectDetailById(projectId);
    const rawBody = await request.text();
    const signature = request.headers.get('x-hub-signature-256');

    if (!verifyGitHubWebhookSignature(project.webhookSecret, rawBody, signature)) {
      return jsonDevError(new Error('Webhook signature verification failed.'), '', 401);
    }

    const event = request.headers.get('x-github-event') ?? '';

    if (event === 'ping') {
      return Response.json({ ok: true, message: 'Webhook connected.' });
    }

    if (event !== 'push') {
      return Response.json({ accepted: false, reason: 'Ignored non-push event.' }, { status: 202 });
    }

    const payload = parseGitHubPushPayload(rawBody);
    const repositoryFullName = getWebhookRepositoryFullName(payload);
    const expectedFullName = `${project.repositoryOwner}/${project.repositoryName}`.toLowerCase();

    if (!repositoryFullName || repositoryFullName.toLowerCase() !== expectedFullName) {
      return Response.json(
        { accepted: false, reason: 'Webhook repository does not match this project.' },
        { status: 202 }
      );
    }

    if (getWebhookBranchRef(payload) !== `refs/heads/${project.branch}`) {
      return Response.json(
        { accepted: false, reason: `Ignored push for a branch other than ${project.branch}.` },
        { status: 202 }
      );
    }

    if (!project.autoDeploy) {
      return Response.json(
        { accepted: false, reason: 'Automatic preview deployments are disabled.' },
        { status: 202 }
      );
    }

    let commit = getWebhookCommit(payload);

    if (!commit) {
      return Response.json(
        { accepted: false, reason: 'Push did not contain a commit.' },
        { status: 202 }
      );
    }

    if (!payload.head_commit) {
      const repository = parseGitHubRepositoryReference(project.repositoryUrl);
      const token = getAppConfig().security.githubToken;

      if (repository && token) {
        commit = await getGitHubCommit(token, repository.owner, repository.name, commit.sha);
      }
    }

    const result = await enqueueDevDeployment(project, commit);

    return Response.json(
      {
        accepted: true,
        created: result.created,
        deploymentId: result.deployment.id,
      },
      { status: 202 }
    );
  } catch (error) {
    return jsonDevError(error, 'Unable to process GitHub webhook.');
  }
}
