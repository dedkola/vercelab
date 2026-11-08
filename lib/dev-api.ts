function getDevApiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

export function jsonDevError(error: unknown, fallback: string, status = 400) {
  return Response.json(
    {
      error: getDevApiErrorMessage(error, fallback),
    },
    { status }
  );
}
