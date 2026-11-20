import { describe, expect, it, vi } from "vitest";
import { createSupabaseDiagnosticFetch, serializeSupabaseError } from "./server-diagnostics";

describe("serializeSupabaseError", () => {
  it("preserves empty messages and nested network causes", () => {
    const cause = Object.assign(new Error("fetch failed"), { code: "ENOTFOUND" });
    const error = new Error("");
    Object.defineProperty(error, "cause", { value: cause });

    expect(serializeSupabaseError(error)).toMatchObject({
      name: "Error",
      message: "",
      messageEmpty: true,
      cause: {
        name: "Error",
        message: "fetch failed",
        code: "ENOTFOUND",
      },
    });
  });

  it("logs HTTP 4xx status without query parameters", async () => {
    const response = new Response(null, {
      status: 400,
      statusText: "Bad Request",
      headers: { "sb-request-id": "request-id" },
    });
    const fetcher = vi.fn(async () => response);
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});

    await createSupabaseDiagnosticFetch(fetcher as typeof fetch)(
      "https://example.supabase.co/rest/v1/login_attempts?identifier=private",
      { method: "HEAD" },
    );

    expect(logError).toHaveBeenCalledWith(
      "[Supabase] HTTP request returned an error status",
      expect.objectContaining({
        endpoint: "https://example.supabase.co/rest/v1/login_attempts",
        method: "HEAD",
        status: 400,
        statusText: "Bad Request",
        requestId: "request-id",
      }),
    );
    expect(JSON.stringify(logError.mock.calls)).not.toContain("identifier=private");
    logError.mockRestore();
  });
});
