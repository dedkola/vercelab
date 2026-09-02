import {
  deleteDeploymentFile,
  listDeploymentFiles,
  MAX_DEPLOYMENT_FILE_SIZE,
  saveDeploymentFile,
  updateDeploymentFileAccess,
} from '@/lib/deployment-files';

export const dynamic = 'force-dynamic';

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Unable to manage deployment files.';
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ deploymentId: string }> }
) {
  const { deploymentId } = await params;

  try {
    return Response.json({ files: await listDeploymentFiles(deploymentId) });
  } catch (error) {
    return Response.json({ error: getErrorMessage(error) }, { status: 400 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ deploymentId: string }> }
) {
  const { deploymentId } = await params;

  try {
    const formData = await request.formData();
    const uploadedFile = formData.get('file');
    const requestedFileName = formData.get('fileName');
    const requestedAccess = formData.get('access');

    if (!(uploadedFile instanceof File)) {
      throw new Error('Choose a file to upload.');
    }

    if (requestedFileName !== null && typeof requestedFileName !== 'string') {
      throw new Error('File name must be text.');
    }

    if (uploadedFile.size > MAX_DEPLOYMENT_FILE_SIZE) {
      throw new Error('File is too large. The maximum upload size is 5 MB.');
    }

    const file = await saveDeploymentFile(
      deploymentId,
      requestedFileName?.trim() || uploadedFile.name,
      new Uint8Array(await uploadedFile.arrayBuffer()),
      requestedAccess
    );

    return Response.json({ file }, { status: 201 });
  } catch (error) {
    return Response.json({ error: getErrorMessage(error) }, { status: 400 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ deploymentId: string }> }
) {
  const { deploymentId } = await params;

  try {
    const payload = (await request.json()) as { access?: unknown; fileName?: unknown };

    if (typeof payload.fileName !== 'string' || !payload.fileName.trim()) {
      throw new Error('Missing file name.');
    }

    return Response.json({
      file: await updateDeploymentFileAccess(deploymentId, payload.fileName, payload.access),
    });
  } catch (error) {
    return Response.json({ error: getErrorMessage(error) }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ deploymentId: string }> }
) {
  const { deploymentId } = await params;

  try {
    const fileName = new URL(request.url).searchParams.get('name');

    if (!fileName) {
      throw new Error('Missing file name.');
    }

    return Response.json({ file: await deleteDeploymentFile(deploymentId, fileName) });
  } catch (error) {
    return Response.json({ error: getErrorMessage(error) }, { status: 400 });
  }
}
