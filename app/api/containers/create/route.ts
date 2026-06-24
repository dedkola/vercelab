import {
  createContainerFromCompose,
  createContainerFromImage,
} from "@/lib/container-create";
import type { ExposureMode } from "@/lib/validation";

export const dynamic = "force-dynamic";

type CreateContainerRequest =
  | {
      containerName?: string;
      envVariables?: string;
      exposureMode?: ExposureMode;
      hostPort?: number;
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
        exposureMode: payload.exposureMode,
        hostPort: payload.hostPort,
        image: payload.image,
        ports: payload.ports,
      });

      const mode = created.exposureMode;
      let message: string;

      if (mode === "http" && created.url) {
        message = `Started ${created.containerName} at ${created.url}.`;
      } else if (mode === "tcp" && created.hostPort) {
        message = `Started ${created.containerName} on TCP port ${created.hostPort}.`;
      } else {
        message = `Started ${created.containerName}.`;
      }

      return Response.json({ message, ...created }, { status: 201 });
    }

    if (payload.mode === "compose") {
      const created = await createContainerFromCompose({
        composeContent: payload.composeContent,
        stackName: payload.stackName,
      });

      return Response.json(
        {
          message: created.urls?.length
            ? `Started compose stack ${created.stackName}. Routes: ${created.urls.join(", ")}.`
            : `Started compose stack ${created.stackName}.`,
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