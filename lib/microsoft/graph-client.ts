import {
  refreshIfExpired,
  type MicrosoftConnectionLike,
  type MicrosoftOAuthCredentials,
} from '@/lib/microsoft/oauth';

/**
 * Thin wrapper around Microsoft Graph v1.0 that handles auth refresh and
 * surfaces errors with enough context for the caller to decide whether to
 * retry. Intentionally raw `fetch` rather than @microsoft/microsoft-graph-
 * client — for the four endpoints we hit in PR 2 (`POST /subscriptions`,
 * `PATCH /subscriptions/{id}`, `DELETE /subscriptions/{id}`, and the webhook
 * doesn't make outbound calls), the SDK adds dependencies and indirection
 * without saving meaningful code. The Graph SDK lands in PR 3 where its
 * streaming-fetch + paging helpers earn their weight on transcript content.
 *
 * The "refreshed connection" return shape lets callers persist new tokens
 * back to the database when refresh fires, so the next call has fresh
 * material.
 */

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

export class GraphRequestError extends Error {
  constructor(
    public status: number,
    public bodyText: string,
    public method: string,
    public path: string,
  ) {
    super(`Graph ${method} ${path} failed (${status}): ${bodyText.slice(0, 400)}`);
    this.name = 'GraphRequestError';
  }
}

export interface GraphCallResult<T> {
  data: T;
  /** Whether the underlying connection was refreshed during the call. If true,
   *  caller MUST persist the returned connection's tokens. */
  refreshed: boolean;
  connection: MicrosoftConnectionLike;
}

export interface GraphCallArgs {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  /** Override the base; default is graph.microsoft.com/v1.0. Only used in tests. */
  baseUrl?: string;
}

/**
 * Make an authenticated Graph call. Auto-refreshes the access token if it
 * expires within the next 60 seconds. Throws GraphRequestError on non-2xx.
 *
 * Returns: { data, refreshed, connection }. The connection is the fresh one
 * after any refresh — caller persists if `refreshed` is true.
 */
export async function graphCall<T = unknown>(args: {
  connection: MicrosoftConnectionLike;
  credentials: MicrosoftOAuthCredentials;
  call: GraphCallArgs;
}): Promise<GraphCallResult<T>> {
  const { connection: input, credentials, call } = args;
  const { connection, refreshed } = await refreshIfExpired(input, credentials);

  const url = `${call.baseUrl ?? GRAPH_BASE}${call.path}`;
  const init: RequestInit = {
    method: call.method,
    headers: {
      Authorization: `Bearer ${connection.accessToken}`,
      ...(call.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(call.body !== undefined ? { body: JSON.stringify(call.body) } : {}),
  };
  const res = await fetch(url, init);

  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return { data: undefined as T, refreshed, connection };
  }

  const text = await res.text();
  if (!res.ok) {
    throw new GraphRequestError(res.status, text, call.method, call.path);
  }

  let data: T;
  try {
    data = text ? (JSON.parse(text) as T) : (undefined as T);
  } catch {
    throw new GraphRequestError(
      res.status,
      `Non-JSON response body: ${text.slice(0, 200)}`,
      call.method,
      call.path,
    );
  }
  return { data, refreshed, connection };
}
