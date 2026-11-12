# SpendGate

SpendGate is a lightweight B2B SaaS application for managing employee purchase requests, department budgets and approval workflows.

Users can work with SpendGate in two ways:

1. **Web dashboard** (React) for employees and finance managers.
2. **Claude via MCP**: a separate, remotely reachable MCP server. Claude connects to it as an external client, and natural-language requests create and update records.

> **Status: Phase 3 (MCP integration).** Purchase requests, budget validation, approval routing, approvals, audit logs and the live dashboard work through the web UI **and** through five MCP tools over Streamable HTTP. The REST API and MCP share one service layer, so the business rules exist in only one place.

## Business rules

| Rule | Implementation |
| ---- | -------------- |
| Committed spend = sum of `PENDING_APPROVAL` + `APPROVED` request amounts | `services/budget.service.ts` |
| Available budget = allocated − committed (drafts and rejected requests don't count) | `services/budget.service.ts` |
| A request can't be submitted if its amount is more than the department's available budget (`422 BUDGET_EXCEEDED`) | `assertWithinBudget` |
| Routing: below ₹10,000 → Team Lead; ₹10,000–₹50,000 → Department Manager; above ₹50,000 → Finance Manager | `config/approvalRules.ts` (thresholds set via env vars) |
| Editing a pending request re-checks the budget and may re-route the approval | `updatePurchaseRequest` |
| Only `DRAFT` and `PENDING_APPROVAL` requests can be edited; only drafts can be deleted | `purchaseRequest.service.ts` |
| A rejection needs a reason; a request that has already been decided can't be approved or rejected again (`409`) | `approval.service.ts` |
| Duplicate protection: re-submitting fails (`409 ALREADY_SUBMITTED`); identical requests within 2 minutes fail (`409 DUPLICATE_REQUEST`) | `purchaseRequest.service.ts` |
| Every create, edit, submit, approve, reject and delete writes an audit record in the same transaction | `services/audit.service.ts` |

Every write runs through `withWriteTransaction` (`database/transaction.ts`), which takes SQLite's write lock as its first step. Budget checks therefore always see the latest committed data, even when the REST API and the MCP server write at the same time. A test with two parallel submits, each for 60% of a department's budget, accepted one and rejected the other.

## REST API

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/health` | Health check, including a database check |
| GET | `/api/dashboard/summary` | Totals, pending approvals, recent requests, department utilization, routing rules |
| GET | `/api/departments` | Budget position for each department |
| GET | `/api/purchase-requests` | List; filters: `search`, `status`, `departmentId`, `category`, `page`, `pageSize` |
| POST | `/api/purchase-requests` | Create; send `submit: true` to submit immediately (if the budget check fails, nothing is saved) |
| GET | `/api/purchase-requests/:id` | Request details, approval record and audit history |
| PATCH | `/api/purchase-requests/:id` | Edit a draft or pending request (`performedBy` required) |
| POST | `/api/purchase-requests/:id/submit` | Submit a draft (`performedBy` required) |
| DELETE | `/api/purchase-requests/:id` | Delete a draft (`performedBy` in the body) |
| GET | `/api/approvals` | List; filters: `status`, `approverRole`, `page`, `pageSize` |
| POST | `/api/approvals/:id/approve` | `{ approverName, comments? }` |
| POST | `/api/approvals/:id/reject` | `{ approverName, reason }` (reason required) |
| GET | `/api/audit-logs` | List; filters: `entityType`, `entityId`, `action`, `page`, `pageSize` |

Amounts are sent in rupees as a string, for example `"20000"` or `"1499.50"`, and returned as `{ minor, major, currency }`. Errors use one shape: `{ error: { code, message, details? } }`.

> **No end-user authentication yet.** The REST API (bound to `127.0.0.1`) records the names the dashboard sends (`requesterName`, `performedBy`, `approverName`) exactly as given. Add authentication before any real-world use.

---

## MCP integration (Claude)

### Endpoint

| Item | Value |
| ---- | ----- |
| Transport | Streamable HTTP, stateless (official `@modelcontextprotocol/sdk` 1.x) |
| URL (header auth) | `POST http://127.0.0.1:4001/mcp` with `Authorization: Bearer <MCP_AUTH_TOKEN>` |
| URL (secret path) | `POST http://127.0.0.1:4001/mcp/<MCP_AUTH_TOKEN>`, for clients that can't send headers |
| Health | `GET http://127.0.0.1:4001/health` (no auth, no data) |
| `GET` / `DELETE /mcp` | `405`. The server is stateless and offers no event stream, as the MCP spec allows. |

### Tools

| Tool | Purpose | Service it calls |
| ---- | ------- | ---------------- |
| `create_purchase_request` | Create a request, optionally submitting it at once. Budget check and routing run on submit; on a budget failure nothing is saved. | `createPurchaseRequest` |
| `list_purchase_requests` | Filter by status, department name, category or free text. 20 per page by default, 50 maximum. | `listPurchaseRequests` |
| `get_budget_summary` | Allocated, pending, approved, total committed, available and utilization for one department or all | `getBudgetSummary` |
| `update_purchase_request` | Edit by reference (`PR-100001`). Draft or pending requests only; budget re-checked and approval re-routed if needed. | `updatePurchaseRequest` |
| `approve_purchase_request` | Approve or reject by reference; a rejection needs a reason | `approveRequestByReference` / `rejectRequestByReference` |

Each tool handler does four things: it resolves the department name or reference using a service, validates input with the **same Zod schemas as the REST API**, calls the **same service function**, and formats the result. Handlers contain no business rules and make no direct Prisma calls. Errors come back as tool errors with a stable code, for example `BUDGET_EXCEEDED`, `REQUEST_LOCKED`, `APPROVAL_ALREADY_PROCESSED`, `NOT_FOUND`, `FORBIDDEN` or `VALIDATION_ERROR`. Unexpected errors return a generic message; details are logged on the server only.

### Security model (MVP)

| Control | Behavior |
| ------- | -------- |
| Authentication | Shared secret `MCP_AUTH_TOKEN` (at least 32 characters), checked in constant time. **Required** whenever `MCP_HOST` is not a loopback address or `NODE_ENV=production`; the server refuses to start without it. |
| Caller identity | Comes from server config (`MCP_CLIENT_NAME`), never from the request. Audit entries carry `channel: "mcp"`, the client name and `identityVerified: false`. |
| Approver names | The `approverName` Claude sends is a **claim**. It is recorded as `"<name> (via <MCP_CLIENT_NAME>)"` and is not trusted for permissions. |
| Role authorization | `MCP_APPROVER_ROLES` (default `TEAM_LEAD,DEPARTMENT_MANAGER`) is enforced inside the approval service's transaction. By default **Claude cannot approve Finance Manager requests (above ₹50,000)**, even if it claims to be the CFO; those must be approved in the dashboard. |
| Host validation | Blocks DNS-rebinding attacks. Add your tunnel hostname to `MCP_ALLOWED_HOSTS`. |
| Rate limit | `MCP_RATE_LIMIT_PER_MINUTE` per client IP (in memory, single instance) |
| Data | Seed data is fictional demo data. Don't connect the MVP to real financial data. |

**Demo limitation:** one token represents one client identity. It does not authenticate individual people. For production, replace it with OAuth 2.1 (the MCP authorization spec) and map users to real roles.

### Configuration

Add these to `spendgate/.env`:

```dotenv
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
MCP_AUTH_TOKEN=<64-hex-character secret>
MCP_CLIENT_NAME=Claude MCP
MCP_APPROVER_ROLES=TEAM_LEAD,DEPARTMENT_MANAGER
MCP_ALLOWED_HOSTS=            # e.g. your-tunnel.trycloudflare.com
MCP_RATE_LIMIT_PER_MINUTE=120
DASHBOARD_URL=http://localhost:5173
```

Then start everything: `npm run dev` (API and dashboard) and `npm run dev:mcp` (MCP server).

### Connecting Claude

> These steps follow each client's documented setup. Only the SDK test client has connected so far (see the test results below); connection from Claude itself has **not** been verified yet.

**Claude Code (local):**

```bash
claude mcp add --transport http spendgate http://127.0.0.1:4001/mcp \
  --header "Authorization: Bearer <MCP_AUTH_TOKEN>"
```

Then start a new Claude Code session and run `/mcp` to check that the `spendgate` tools are listed.

**Claude Desktop (local, through the `mcp-remote` bridge):** edit `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "spendgate": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://127.0.0.1:4001/mcp", "--header", "Authorization: Bearer ${SPENDGATE_TOKEN}"],
      "env": { "SPENDGATE_TOKEN": "<MCP_AUTH_TOKEN>" }
    }
  }
}
```

`mcp-remote` is a third-party npm package. Review it before use.

**Claude.ai custom connector (remote):** Claude.ai connects from Anthropic's cloud, so it needs a public **HTTPS** URL. It also can't send a custom bearer header; it supports only OAuth or no auth.

1. Keep `MCP_HOST=127.0.0.1` and set `MCP_AUTH_TOKEN`.
2. Expose port 4001 with a tunnel, for example `cloudflared tunnel --url http://127.0.0.1:4001` or `ngrok http 4001`.
3. Set `MCP_ALLOWED_HOSTS=<tunnel hostname>` and restart `npm run dev:mcp`.
4. In claude.ai, go to **Settings → Connectors → Add custom connector** and enter `https://<tunnel hostname>/mcp/<MCP_AUTH_TOKEN>`.

Treat that URL like a password: anyone who has it can use the tools. Use demo data only, and stop the tunnel when you're done.

**MCP Inspector (debugging):** run `npx @modelcontextprotocol/inspector`, choose transport **Streamable HTTP** with URL `http://127.0.0.1:4001/mcp`, and add the header `Authorization: Bearer <token>`.

### Example prompts

- "Show me all pending purchase requests." → `list_purchase_requests(status=PENDING_APPROVAL)`
- "What is the remaining engineering budget?" → `get_budget_summary(departmentName="engineering")`
- "Create a ₹20,000 purchase request for engineering for laptop accessories." → `create_purchase_request(...)`
- "Edit PR-100013 and increase its amount to ₹25,000." → `update_purchase_request(reference, amount=25000)`
- "Approve PR-100013." → `approve_purchase_request(reference, action="approve", approverName)`

### Automated MCP tests

```bash
MCP_AUTH_TOKEN=<token> npm run test:mcp   # needs the API and MCP servers running
```

The test connects with the official SDK client over Streamable HTTP. It checks authentication, Host validation, tool registration, the five example prompts, error handling and role authorization, and it compares every result with what the dashboard shows through the REST API. It creates records, so run it against a development database only.

---

## Tech stack

| Layer    | Technology |
| -------- | ---------- |
| Frontend | React 19, Vite 8, TypeScript, Tailwind CSS 4, React Router 8, Lucide React |
| Backend  | Node.js (>= 20.19), Express 5, TypeScript, Zod (env validation), Helmet, CORS |
| Database | SQLite via Prisma ORM 6 |
| MCP      | `@modelcontextprotocol/sdk` 1.x, Streamable HTTP transport (stateless) |
| Tooling  | npm workspaces, tsx (dev runner), concurrently |

All runtime dependencies use permissive licenses (MIT, Apache 2.0 or ISC).

## Project structure

```text
spendgate/
├── client/                    # React dashboard (Vite)
│   └── src/
│       ├── components/        # Sidebar, Topbar, Card, KpiCard, badges
│       ├── layouts/           # DashboardLayout (sidebar + topbar + outlet)
│       ├── pages/             # Overview, placeholder sections, 404
│       ├── hooks/             # useHealth (API connectivity indicator)
│       ├── lib/               # api client, formatters, navigation, demo data
│       └── types/
├── server/                    # Express REST API + MCP server (separate processes)
│   └── src/
│       ├── config/env.ts      # Validated environment configuration
│       ├── database/          # Prisma client singleton + seed script
│       ├── routes/            # /api router (health only in Phase 1)
│       ├── controllers/       # HTTP adapters, kept thin
│       ├── services/          # Business logic shared by REST and MCP
│       ├── middleware/        # 404 + central error handler
│       ├── lib/               # money helpers, AppError
│       ├── mcp/               # MCP server factory + HTTP entry point (no tools yet)
│       ├── types/
│       ├── app.ts             # Express app factory
│       └── index.ts           # API process entry point
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── package.json               # Workspace root and shared scripts
└── README.md
```

## Architecture rules

1. Business logic lives in `server/src/services`. React components only render data.
2. MCP tools are thin adapters that call the **same** service functions as the REST controllers.
3. Business rules are never duplicated between the MCP and REST paths.
4. No AI API keys or AI model integrations (OpenAI, Anthropic or others) are added anywhere in this project. Claude is an external MCP client only.
5. All configuration comes from environment variables.

```text
 React dashboard ──HTTP──▶ Express routes ─▶ controllers ─┐
                                                           ├─▶ services ─▶ Prisma ─▶ SQLite
 Claude (MCP client) ──HTTP──▶ MCP server ─▶ tools ───────┘
```

The REST API and the MCP server run as **separate processes** that share the same service layer and database file. SQLite runs in WAL mode so both processes can access the file at the same time.

### Money handling

All monetary values are stored as **`BigInt` minor units (paise)**. For example, INR 2,00,000.00 is stored as `20000000`.

SQLite has no exact decimal type, and floating-point storage is unsafe for financial data. Use `server/src/lib/money.ts` (`toMinorUnits`, `toMajorString`, `toMoneyDto`) for every conversion. API responses expose money as strings, because `BigInt` is not JSON-serializable.

### Data model

| Model             | Purpose | Key constraints |
| ----------------- | ------- | --------------- |
| `Department`      | Budget owner | Unique `name`; `allocatedBudget` in paise |
| `PurchaseRequest` | Employee request | FK to department (`Restrict` on delete); indexes on `(departmentId, status)`, `status`, `createdAt` |
| `Approval`        | Per-level decision | FK to request (`Cascade`); unique `(purchaseRequestId, approvalLevel)` |
| `AuditLog`        | Append-only history | No FKs, so history survives deletions; index on `(entityType, entityId)` |

Enums: `PurchaseRequestStatus`, `PurchaseCategory`, `ApprovalStatus`, `AuditEntityType`, `AuditAction`.

---

## Getting started

### Prerequisites

- Node.js **20.19 or later** (developed on Node 24) and npm 10 or later

### 1. Install dependencies

```bash
cd spendgate
npm install
```

The root `package.json` contains an `allowScripts` list that permits install scripts only for `prisma`, `@prisma/client`, `@prisma/engines` and `esbuild`. These scripts are needed to download the Prisma query engine and the esbuild binary.

### 2. Configure environment

Create `spendgate/.env` with the following content. This is the same content as the `.env.example` template.

```dotenv
# Runtime environment: development | test | production
NODE_ENV=development

# SQLite database location. Relative paths resolve from prisma/,
# so this creates spendgate/prisma/dev.db.
DATABASE_URL="file:./dev.db"

# REST API (Express)
API_HOST=127.0.0.1
API_PORT=4000

# Comma-separated browser origins allowed to call the REST API.
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# MCP server (separate process; no tools registered yet).
# Keep bound to 127.0.0.1 until authentication is added.
MCP_HOST=127.0.0.1
MCP_PORT=4001

# Frontend API base URL. Leave empty in development to use the Vite proxy.
VITE_API_BASE_URL=

# Approval routing thresholds, in whole rupees.
# Below TEAM_LEAD_BELOW -> Team Lead; up to DEPARTMENT_MANAGER_UP_TO -> Dept Manager; above -> Finance.
APPROVAL_TEAM_LEAD_BELOW=10000
APPROVAL_DEPARTMENT_MANAGER_UP_TO=50000
```

The server falls back to these same defaults when a variable is missing. The **Prisma CLI**, however, requires `DATABASE_URL`.

### 3. Create the database and seed it

```bash
npm run db:migrate      # applies prisma/migrations (creates prisma/dev.db)
npm run db:seed         # Engineering INR 2,00,000 · Marketing INR 1,50,000 · Operations INR 1,50,000
```

The seed is idempotent, so you can run it again safely.

### 4. Run the app

```bash
npm run dev             # API (4000) + dashboard (5173) together
npm run dev:mcp         # MCP server (4001), in a second terminal
```

Or run each process on its own:

```bash
npm run dev:server
npm run dev:client
npm run dev:mcp
```

### Local URLs

| Service                | URL |
| ---------------------- | --- |
| Dashboard              | http://localhost:5173 |
| API health             | http://127.0.0.1:4000/api/health |
| API health (via proxy) | http://localhost:5173/api/health |
| MCP endpoint           | http://127.0.0.1:4001/mcp (POST, Streamable HTTP) |
| MCP process health     | http://127.0.0.1:4001/health |

### Verify

```bash
curl http://127.0.0.1:4000/api/health
# {"status":"ok","service":"spendgate-api",...,"checks":{"database":{"status":"ok","latencyMs":1}}}
```

The sidebar footer in the dashboard shows **API connected** when the backend is reachable.

## Scripts (run from `spendgate/`)

| Script | Description |
| ------ | ----------- |
| `npm run dev` | API and dashboard in watch mode |
| `npm run dev:server` / `dev:client` / `dev:mcp` | Run one process |
| `npm run typecheck` | Strict TypeScript check for both packages |
| `npm run build` | Generate the Prisma client, then compile the server and build the client |
| `npm run db:migrate` | Create and apply migrations (development) |
| `npm run db:deploy` | Apply existing migrations (CI or production) |
| `npm run db:seed` | Seed departments |
| `npm run db:reset` | Drop the database, re-apply migrations and re-seed (**destructive**) |
| `npm run db:studio` | Open Prisma Studio |
| `npm run test:mcp` | Automated MCP tool tests (set `MCP_AUTH_TOKEN`; needs the API and MCP servers running; **creates records**) |
| `npm run test:smoke` | End-to-end test of the Phase 2 scenarios against a running API (**creates records**, so use a development database only) |

## Security notes

- **MCP** is protected by a shared-secret token, server-side role limits, Host-header validation and rate limiting (see "MCP integration"). Replace the token with OAuth 2.1 before production use.
- The REST API uses Helmet, an explicit CORS allow-list and a 100 KB JSON body limit.
- Error responses never include stack traces or connection details. In production they include only a code and a message.
- `.env` and `*.db` files are git-ignored.

## Known trade-offs

- **SQLite** keeps setup at zero cost and zero configuration, but it allows only one writer at a time. Move to PostgreSQL before multi-tenant or high-concurrency use. The Prisma schema ports with minimal changes.
- **Prisma 6** was chosen over Prisma 7. Version 7 requires driver adapters and a new config file, which adds setup overhead that does not pay off for an MVP.
- **Stateless MCP transport** scales horizontally with no session store. It does not support server-initiated notifications, which the MVP does not need.

## Deploying the hosted prototype (Render)

`render.yaml` defines one web service that serves the dashboard, `/api` and `/mcp` from a single port (`server/src/production.ts`). The MCP app stays a separate Express app; it is only hosted on the same port.

1. Push the repo to GitHub. Never commit `.env` (it is git-ignored).
2. In Render, choose **New → Blueprint**, pick the repo, and paste a newly generated 64-hex-character `MCP_AUTH_TOKEN` when Render asks for it.
3. After the deploy finishes, the URLs are:
   - Dashboard: `https://<service>.onrender.com`
   - MCP (Claude Code): `https://<service>.onrender.com/mcp` with `Authorization: Bearer <token>`
   - MCP (claude.ai custom connector): `https://<service>.onrender.com/mcp/<token>`

**Demo hosting limits:**
- The database is SQLite on the free tier's temporary disk. It is recreated, with fictional demo data, on every deploy or restart.
- Free instances sleep when idle, so the first request after a pause is slow.
- The dashboard has no login.

This build was checked in a Linux `node:22` container that mirrors the Render build and start commands: the dashboard routes, the API, MCP authentication and all 58 MCP tests passed.

## Next phases

- End-user authentication for the dashboard, and OAuth 2.1 for MCP, with per-user roles.
- A shared rate-limit store and a PostgreSQL database for multi-instance deployments.
