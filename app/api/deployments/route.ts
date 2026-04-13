import { createAndDeployFromForm } from "@/lib/deployment-engine";

export const dynamic = "force-dynamic";

function getRequiredString(formData: FormData, name: string) {
  const value = formData.get(name);

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required field: ${name}`);
  }

  return value;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unexpected deployment error.";
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const deployment = await createAndDeployFromForm({
      repositoryUrl: getRequiredString(formData, "repositoryUrl"),
      githubToken: formData.get("githubToken"),
      branch: formData.get("branch"),
      serviceName: formData.get("serviceName"),
      appName: getRequiredString(formData, "appName"),
      subdomain: getRequiredString(formData, "subdomain"),
      port: getRequiredString(formData, "port"),
      envVariables: formData.get("envVariables"),
    });

    return Response.json(deployment, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error: getErrorMessage(error),
      },
      {
        status: 400,
      },
    );
  }
}
