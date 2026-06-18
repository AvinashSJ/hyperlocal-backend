type ChainCall = { method: string; args: unknown[] };
type Response = { data?: unknown; error?: unknown; count?: number | null };

type Chainable = {
  _chain: ChainCall[];
  _take: () => Response;
  select: (cols?: string) => Chainable;
  insert: (rows: unknown) => Chainable;
  update: (data: unknown) => Chainable;
  delete: () => Chainable;
  upsert: (rows: unknown) => Chainable;
  eq: (col: string, val: unknown) => Chainable;
  neq: (col: string, val: unknown) => Chainable;
  in: (col: string, vals: unknown[]) => Chainable;
  gte: (col: string, val: unknown) => Chainable;
  lte: (col: string, val: unknown) => Chainable;
  gt: (col: string, val: unknown) => Chainable;
  lt: (col: string, val: unknown) => Chainable;
  not: (col: string, op: string, val: unknown) => Chainable;
  is: (col: string, val: unknown) => Chainable;
  order: (col: string, opts?: { ascending?: boolean }) => Chainable;
  limit: (n: number) => Chainable;
  range: (from: number, to: number) => Chainable;
  match: (q: Record<string, unknown>) => Chainable;
  contains: (col: string, val: unknown) => Chainable;
  single: () => Promise<Response>;
  maybeSingle: () => Promise<Response>;
  then: <T, U>(
    onFulfilled?: (v: Response) => T | Promise<T>,
    onRejected?: (e: unknown) => U | Promise<U>,
  ) => Promise<T | U>;
};

export type MockSupabaseUser = {
  id: string;
  email?: string | null;
  phone?: string | null;
  created_at?: string;
  last_sign_in_at?: string | null;
  user_metadata?: Record<string, unknown>;
};

export type MockSupabaseHandle = {
  client: any;
  calls: ChainCall[];
  setResponses: (...responses: (Response | null | undefined)[]) => void;
  enqueueResponse: (response: Response | null) => void;
  setUsers: (users: MockSupabaseUser[]) => void;
  setBuckets: (buckets: { name: string }[]) => void;
  setFiles: (bucket: string, files: any[]) => void;
  setRpcResult: (name: string, response: Response) => void;
  reset: () => void;
  /** Return all chains for a given table (each `.from()` call is one chain). */
  chainsForTable: (table: string) => ChainCall[][];
};

export function createMockSupabase(): MockSupabaseHandle {
  const calls: ChainCall[] = [];
  const rpcResults: Record<string, Response> = {};
  let responseQueue: (Response | null)[] = [];
  let responseIndex = 0;
  let users: MockSupabaseUser[] = [];
  let buckets: { name: string }[] = [];
  let filesByBucket: Record<string, any[]> = {};

  function take(): Response {
    if (responseIndex >= responseQueue.length) {
      return { data: null, error: null };
    }
    const next = responseQueue[responseIndex++];
    return next ?? { data: null, error: null };
  }

  function makeBuilder(): Chainable {
    const chain: ChainCall[] = [];
    const builder: any = { _chain: chain };

    const record = (method: string, args: unknown[]) => {
      const entry = { method, args };
      chain.push(entry);
      calls.push(entry);
    };

    const chainableMethods = [
      "select",
      "insert",
      "update",
      "delete",
      "upsert",
      "eq",
      "neq",
      "in",
      "gte",
      "lte",
      "gt",
      "lt",
      "not",
      "is",
      "order",
      "limit",
      "range",
      "match",
      "contains",
    ] as const;

    for (const m of chainableMethods) {
      builder[m] = (...args: unknown[]) => {
        record(m, args);
        return builder;
      };
    }

    builder.single = () => {
      record("single", []);
      return Promise.resolve(take());
    };

    builder.maybeSingle = () => {
      record("maybeSingle", []);
      return Promise.resolve(take());
    };

    builder.then = (onFulfilled?: (v: Response) => unknown, onRejected?: (e: unknown) => unknown) => {
      record("then", []);
      return Promise.resolve(take()).then(onFulfilled, onRejected);
    };

    return builder as Chainable;
  }

  const client: any = {
    from(table: string) {
      calls.push({ method: "from", args: [table] });
      return makeBuilder();
    },

    rpc(name: string, args: unknown) {
      calls.push({ method: "rpc", args: [name, args] });
      if (rpcResults[name]) return Promise.resolve(rpcResults[name]);
      return Promise.resolve(take());
    },

    auth: {
      async getUser() {
        calls.push({ method: "auth.getUser", args: [] });
        return take();
      },
      async signInWithPassword(creds: unknown) {
        calls.push({ method: "auth.signInWithPassword", args: [creds] });
        return take();
      },
      async signOut() {
        calls.push({ method: "auth.signOut", args: [] });
        return take();
      },
      async signUp(creds: unknown) {
        calls.push({ method: "auth.signUp", args: [creds] });
        return take();
      },
      admin: {
        async listUsers() {
          calls.push({ method: "auth.admin.listUsers", args: [] });
          return { data: { users }, error: null };
        },
        async createUser(payload: { email: string; [k: string]: unknown }) {
          calls.push({ method: "auth.admin.createUser", args: [payload] });
          const user: MockSupabaseUser = {
            id: `user-${users.length + 1}-${Date.now()}`,
            email: payload.email,
            created_at: new Date().toISOString(),
            last_sign_in_at: null,
            user_metadata: (payload as any).user_metadata ?? {},
          };
          users.push(user);
          return { data: { user }, error: null };
        },
        async deleteUser(id: string) {
          calls.push({ method: "auth.admin.deleteUser", args: [id] });
          users = users.filter((u) => u.id !== id);
          return { data: null, error: null };
        },
        async updateUserById(id: string, data: unknown) {
          calls.push({ method: "auth.admin.updateUserById", args: [id, data] });
          const idx = users.findIndex((u) => u.id === id);
          if (idx >= 0) users[idx] = { ...users[idx], ...(data as any) };
          return { data: { user: users[idx] }, error: null };
        },
      },
    },

    storage: {
      async listBuckets() {
        calls.push({ method: "storage.listBuckets", args: [] });
        return { data: buckets, error: null };
      },
      async createBucket(name: string, opts: unknown) {
        calls.push({ method: "storage.createBucket", args: [name, opts] });
        if (!buckets.find((b) => b.name === name)) {
          buckets.push({ name, ...(opts as object) });
        }
        return { data: null, error: null };
      },
      from(bucket: string) {
        const fromCalls = calls;
        return {
          async upload(path: string, file: unknown, opts: unknown) {
            fromCalls.push({ method: `storage[${bucket}].upload`, args: [path, file, opts] });
            if (!filesByBucket[bucket]) filesByBucket[bucket] = [];
            filesByBucket[bucket].push({ name: path, metadata: { size: 0 } });
            return { data: { path }, error: null };
          },
          getPublicUrl(path: string) {
            fromCalls.push({ method: `storage[${bucket}].getPublicUrl`, args: [path] });
            return {
              data: {
                publicUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`,
              },
            };
          },
          async list(path: string, opts: unknown) {
            fromCalls.push({ method: `storage[${bucket}].list`, args: [path, opts] });
            return { data: filesByBucket[bucket] ?? [], error: null };
          },
          async remove(paths: string[]) {
            fromCalls.push({ method: `storage[${bucket}].remove`, args: [paths] });
            return { data: null, error: null };
          },
        };
      },
    },
  };

  return {
    client,
    calls,
    setResponses(...responses: (Response | null | undefined)[]) {
      responseQueue = responses.map((r) => r ?? null);
      responseIndex = 0;
    },
    enqueueResponse(response) {
      responseQueue.push(response);
    },
    setUsers(next) {
      users = next;
    },
    setBuckets(next) {
      buckets = next;
    },
    setFiles(bucket, files) {
      filesByBucket[bucket] = files;
    },
    setRpcResult(name, response) {
      rpcResults[name] = response;
    },
    reset() {
      responseQueue = [];
      responseIndex = 0;
      users = [];
      buckets = [];
      filesByBucket = {};
      calls.length = 0;
    },
    chainsForTable(table) {
      const result: ChainCall[][] = [];
      let i = 0;
      while (i < calls.length) {
        if (calls[i].method === "from" && calls[i].args[0] === table) {
          const chain: ChainCall[] = [calls[i]];
          i++;
          while (i < calls.length && calls[i].method !== "from") {
            chain.push(calls[i]);
            i++;
          }
          result.push(chain);
        } else {
          i++;
        }
      }
      return result;
    },
  };
}
