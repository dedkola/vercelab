import {
  createContainerFromCompose,
  createContainerFromImage,
} from "@/lib/container-create";

export const dynamic = "force-dynamic";

type CreateContainerRequest =
  | {
      containerName?: string;
      envVariables?: string;
      image: string;
      mode: "image";
      ports?: string;
    }
  | {
      composeContent: string;
      mode: "compose";
      stackName?: string;
    };

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unable to create container.";
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as CreateContainerRequest;

    if (payload.mode === "image") {
      const created = await createContainerFromImage({
        containerName: payload.containerName,
        envVariables: payload.envVariables,
        image: payload.image,
        ports: payload.ports,
      });

      return Response.json(
        {
          message: `Started ${created.containerName}.`,
          ...created,
        },
        {
          status: 201,
        },
      );
    }

    if (payload.mode === "compose") {
      const created = await createContainerFromCompose({
        composeContent: payload.composeContent,
        stackName: payload.stackName,
      });

      return Response.json(
        {
          message: `Started compose stack ${created.stackName}.`,
          ...created,
        },
        {
          status: 201,
        },
      );
    }

    throw new Error("Unsupported create mode.");
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