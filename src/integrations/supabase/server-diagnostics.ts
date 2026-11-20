type ErrorRecord = Record<string, unknown>;

function readField(value: object, field: string): unknown {
  try {
    return (value as ErrorRecord)[field];
  } catch {
    return undefined;
  }
}

export function serializeSupabaseError(error: unknown): ErrorRecord {
  const seen = new Set<object>();

  const serialize = (value: unknown, depth: number): unknown => {
    if (value === null || typeof value !== "object") {
      return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? value
        : { type: typeof value };
    }
    if (seen.has(value)) return { type: "circular" };
    if (depth >= 4) return { type: value.constructor?.name ?? "object" };
    seen.add(value);

    const fields: ErrorRecord = {};
    for (const field of [
      "name",
      "message",
      "code",
      "details",
      "hint",
      "status",
      "statusText",
      "errno",
      "syscall",
      "address",
      "port",
      "stack",
    ]) {
      const fieldValue = readField(value, field);
      if (fieldValue !== undefined) fields[field] = fieldValue;
    }

    const ownKeys = Object.getOwnPropertyNames(value);
    if (ownKeys.length) fields.rawKeys = ownKeys;
    const cause = readField(value, "cause");
    if (cause !== undefined) fields.cause = serialize(cause, depth + 1);
    const nestedErrors = readField(value, "errors");
    if (Array.isArray(nestedErrors)) {
      fields.causes = nestedErrors.slice(0, 3).map((nested) => serialize(nested, depth + 1));
    }
    if (!("message" in fields)) fields.type = value.constructor?.name ?? "object";
    if (fields.message === "") fields.messageEmpty = true;
    return fields;
  };

  const serialized = serialize(error, 0);
  return typeof serialized === "object" && serialized !== null && !Array.isArray(serialized)
    ? serialized
    : { raw: serialized };
}

function requestDetails(input: RequestInfo | URL, init?: RequestInit) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  let endpoint = "<invalid URL>";
  try {
    const parsedUrl = new URL(url);
    endpoint = `${parsedUrl.origin}${parsedUrl.pathname}`;
  } catch {
    // Keep diagnostics safe if the fetch input is malformed.
  }
  const method =
    init?.method ??
    (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET");
  return { endpoint, method };
}

export function createSupabaseDiagnosticFetch(fetcher: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const details = requestDetails(input, init);
    try {
      const response = await fetcher(input, init);
      if (!response.ok) {
        console.error("[Supabase] HTTP request returned an error status", {
          ...details,
          status: response.status,
          statusText: response.statusText,
          requestId:
            response.headers.get("sb-request-id") ??
            response.headers.get("x-request-id") ??
            undefined,
        });
      }
      return response;
    } catch (error) {
      console.error("[Supabase] HTTP request failed", {
        ...details,
        error: serializeSupabaseError(error),
      });
      throw error;
    }
  };
}
