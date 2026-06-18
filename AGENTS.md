<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## graphify

This project has a knowledge graph at graphify-out/ with community structure and cross-file relationships.

When the user asks about the codebase structure, components, or data flow, first check graphify-out/GRAPH_REPORT.md for broad architecture context or graphify-out/.graphify_analysis.json for community groupings. Use graphify-out/graph.json for specific node lookups by file or export name.

Rules:
- Dirty graphify-out/ files are expected after code changes; dirty graph files are not a reason to skip graphify.
- Read GRAPH_REPORT.md for broad architecture review or when asked about project status.
- graphify-out/.graphify_analysis.json shows 29 communities — use it to understand which files form logical groups.
- After significant code changes, regenerate the graph by running: node graphify-out/generate_backend_graph.js

## Testing

**Stack:** Vitest 4 + chainable Supabase mocks + `react-dom/server` for component smoke tests + GitHub Actions.

**Run commands:**
```bash
npm test              # vitest run — full suite
npm run test:watch    # vitest (interactive)
npm run test:ui       # vitest --ui
npm run test:coverage # vitest run --coverage
```

**Layout:**
- Test infrastructure: `test/mocks/`, `test/fixtures/`, `test/helpers/`
- Colocated source tests: `src/lib/**/*.test.ts`, `src/app/(admin)/<module>/actions.test.ts`, `src/components/*.test.tsx`
- Coverage report: `TEST_REPORT.md`, `coverage/index.html`

**Per-test imports (in this order):**
1. `"../../../../test/mocks/supabase-clients"` — singleton admin/server handles
2. `"../../../../test/mocks/next-cache"` — `revalidatePath` / `revalidateTag` vi.fn mocks
3. `"../../../../test/mocks/next-navigation"` — `redirect` / `notFound` / `usePathname` mocks
4. `"../../../../test/mocks/require-permission"` — `assertPermission` / `requirePermission` / `asSuperAdmin` / `asAdmin` / `asAnonymous`
5. Use `"@/"` alias for source imports (e.g. `"@/lib/permissions"`)

**For component tests**, add at the top of the file:
```typescript
// @vitest-environment jsdom
```
This overrides the global `node` env. Use `react-dom/server`'s `renderToString` for SSR-style HTML assertions. Mock `next/navigation`, `next/link`, `@iconify/react`, and `react-toastify` at the top of the file (see `src/components/MasterLayout.test.tsx` for a template).

**Conventions:**
- **Use `setResponses(...)` to enqueue responses that REPLACE the queue.** Use `enqueueResponse(...)` to APPEND.
- For Promise.all with mixed sync/async chains, the response queue is consumed in the order the chains are constructed. Enqueue in the actual consumption order.
- For a function whose `id` arg is FIRST (e.g. `updateCategory(id, formData)`), wrap to use `runAction`: `runAction((fd) => updateCategory("c-1", fd), fd)`.
- For functions that don't take formData (e.g. `deleteCategory(id)`, `deleteOrder(id)`), call them directly with `await expect(deleteCategory("c-1")).rejects.toThrow(...)`.
- The mock's `chainsForTable(table)` walks the call list and groups by `from(table)` boundaries. If the source interleaves `.eq` calls on different builders in a sequence (like the dashboard's if block), the calls all get attributed to the LAST chain. Workaround: count total calls in `admin.calls` filtered by args.
- `redirect()` throws a `NEXT_REDIRECT:<url>` sentinel — `runAction` catches it. Assert `result.redirectedTo` not the error.
- Use `as RolePermissions` cast on inline permission objects (e.g. `{ dashboard: ["view"] } as RolePermissions`) because TypeScript widens `string[]` to not match the `PermissionAction[]` literal union.
- TypeScript strict types: use `as const satisfies RolePermissions` or explicit `as RolePermissions` on permission objects.
- For React text containing adjacent expressions (e.g. `{count} selected`), React injects `<!-- -->` text-node separators. Use regex: `/3<!-- -->\s+selected/`.

**Coverage thresholds** (in `vitest.config.ts`):
- Lines: 70%
- Branches: 60%
- Functions: 70%
- Statements: 70%

Current actual coverage: ~93% statements, 86% branches, 93% functions, 94% lines — well above thresholds. See `TEST_REPORT.md` for the per-module breakdown.

**Mock-incompleteness (known limitations, not bugs):**
- `storage.from(bucket).list` and `storage.remove` always return success — cannot test media error paths
- `chainsForTable` groups by call-list boundaries, not by builder closure — see "Mock chainsForTable limitation" in `TEST_REPORT.md` P7 section
- `assertPermissionMock` does NOT validate action names against `PERMISSION_MODULES` — if a test grants a literal action string that's not in the module's allow list, the mock still allows it. Always cross-check the source's `assertPermission(module, action)` against `PERMISSION_MODULES[module]` in `src/lib/permissions.ts`.

**Adding a new test file:**
1. Use the per-test imports pattern above.
2. Match the depth to risk: `actions.ts` for money-critical flows (orders, invoices, commissions), `assertPermission` paths, schema-deriving operations; light otherwise.
3. Run `npm test -- --run <path>` to verify.
4. Run `npm run typecheck` and `npm run lint` to verify nothing broke.

## Lint

- **0 errors required for CI** — eslint returns exit code 0 only if there are no errors. Warnings are non-blocking.
- `graphify-out/` and `coverage/` are excluded — these are generated and not source code.
- `test/**` and `*.test.ts(x)` files disable `@typescript-eslint/no-explicit-any` (legitimate escape hatch for mock patterns).
- Run `npm run lint` to check. Fix errors with the patterns in `TEST_REPORT.md` § Source Bugs Surfaced.
