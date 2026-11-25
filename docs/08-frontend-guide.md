# Frontend guide

## Entry point and providers

```text
client/index.html
  → client/src/main.tsx
    → tRPC provider
      → QueryClientProvider
        → App.tsx
          → ErrorBoundary
            → ThemeProvider (light)
              → TooltipProvider
                → Toaster (Sonner)
                → Router (Wouter)
```

### `main.tsx`

- Creates one `QueryClient`.
- Builds the tRPC URL:
  - `VITE_API_BASE_URL` set → `new URL("/api/trpc", base)`;
  - otherwise → relative `/api/trpc`.
- Uses `httpBatchLink`, `superjson`, and `credentials: "include"`.
- Subscribes to React Query cache events and logs `[API Query Error]` / `[API Mutation Error]`.

### `App.tsx`

Only two routes exist:

| Route | Component |
|---|---|
| `/` | `Home` |
| `/404` | `NotFound` |
| anything else | `NotFound` |

`NotFound` replaces the URL with `/404` so hosting can return a real 404 status.

## Where the app actually lives

Almost all visible application code is in `client/src/pages/Home.tsx`:

- auth screens;
- role onboarding;
- client, fundi, and admin workspaces;
- every modal and panel;
- all queries, mutations, state, and handlers.

`client/src/index.css` is the single global stylesheet for this UI.

### Internal component map in `Home.tsx`

| Component | Responsibility |
|---|---|
| `BrandMark`, `Avatar`, `FieldLabel`, `StatusPill`, `EmptyState` | Shared primitives |
| `Home` | Auth gates, queries, mutations, state, app shell |
| `AuthFrame` | Branded frame for unauthenticated screens |
| `LoginForm` | Login, register, forgot, reset |
| `ClientView` | Client overview dispatch |
| `Metric`, `PanelHeading` | Dashboard building blocks |
| `JobRow`, `FundiMini`, `TradeIcon` | List items |
| `JobsTable`, `JobHistory`, `FundiDirectory` | Client tables and directories |
| `FundiView`, `OpportunityCard` | Kazi board |
| `FundiProfile`, `FundiSideProfile` | Fundi profile and completeness |
| `AdminView` | Control room, accounts, reports |
| `FundiDrawer` | Fundi preview |
| `JobModal` | Post/edit job |
| `RatingModal` | 1–5 star feedback |
| `FundiProfileModal` | Fundi profile editor |
| `ResponsesModal` | Interest review, accept/decline, chat entry |
| `NotificationModal` | Bell menu |
| `InboxModal`, `ChatModal` | Conversations |
| `AccountPanel` | Account facts, photo, logout |

## Rendered component tree

```text
Home
└─ .app-shell
   ├─ .kenya-stripe
   ├─ aside.sidebar
   │  ├─ BrandMark
   │  ├─ pilot chip
   │  ├─ role-specific nav
   │  └─ account button
   ├─ main.main-content
   │  ├─ topbar: mobile menu, crumb, role badge, Bell
   │  └─ page heading + ClientView | FundiView | AdminView
   └─ conditional overlays
      ├─ FundiDrawer
      ├─ JobModal
      ├─ RatingModal
      ├─ FundiProfileModal
      ├─ ResponsesModal
      ├─ NotificationModal
      ├─ InboxModal / ChatModal
      ├─ AccountPanel
      └─ custom toast
```

## Authentication gates

`Home` uses four early-return states:

1. Loading → branded “Loading your MjengoLink workspace…”.
2. Session error → retry button.
3. Signed out → `LoginForm`.
4. Signed in with no recognised role → one-time role choice.

A recognised role is exactly `client`, `fundi`, or `admin`. The database default `user` falls into onboarding.

Once a role exists:

- `dashboard` is enabled;
- `inbox.list` is enabled;
- `notifications.list` is enabled;
- `profile.me` is enabled only for fundis.

## Forms

### `LoginForm` modes

| Mode | Purpose |
|---|---|
| `login` | Email/password sign-in |
| `register` | Full registration with role and optional fundi fields |
| `forgot` | Request reset email |
| `reset` | Set a new password using recovery tokens |

Validation:

- register/reset require matching password confirmation;
- password fields support show/hide;
- register collects the user's own location;
- fundi registration collects trade and optional phone;
- submit is disabled while any auth mutation is pending.

Auth deep links:

- `type=recovery` or `?auth=password-reset` → reset mode;
- `type=signup|magiclink` or `?auth=email-confirmed` → sign-in with confirmation toast;
- `error_description` → error toast;
- URL hash/query markers are removed with `history.replaceState`.

### Job form

`JobModal` fields:

- trade select;
- title;
- description;
- estate/landmark location;
- proposed pay;
- start date with `min=today`;
- contact preference buttons.

Client-side checks only require title, description, budget, and start date to be present. Server validation remains authoritative.

The radius is fixed at `10 km` in the current UI. No GPS picker is exposed; coordinates may be supplied by other clients of the API.

### Fundi profile form

`FundiProfileModal` fields:

- phone;
- service area;
- trade toggles;
- experience;
- summary;
- availability checkbox.

The form is hydrated from `profile.me`. If no profile exists, the service area is prefilled from `users.location`.

## Navigation by role

| Role | Navigation |
|---|---|
| Client | Overview, My jobs, Find fundis, Work history |
| Fundi | Kazi board, My responses, Work history, My profile |
| Admin | Control room, Accounts & jobs, Reports |

Navigation is driven by the `navByRole` map and `activeNav` state. It is not URL-based; everything lives under `/`.

## Data fetching

| Query | Enable condition | Notes |
|---|---|---|
| `auth.me` | always | `retry: false`, no refetch on window focus |
| `dashboard` | signed in with role | `retry: false` |
| `profile.me` | fundi only | `retry: false` |
| `inbox.list` | signed in with role | `retry: false` |
| `notifications.list` | signed in with role | `refetchInterval: 10_000` |
| `jobs.responses` | while review modal open | keyed by selected job |
| `inbox.messages` | while conversation selected | `retry: false` |

There are no optimistic updates. Mutations invalidate the relevant queries.

### Invalidation map

| Mutation | Invalidates |
|---|---|
| `auth.login`, `auth.register`, `auth.setRole` | `auth.me` |
| `auth.logout` | clears entire cache, then hard navigation |
| `jobs.create`, `jobs.update`, `jobs.updateStatus`, `jobs.respond`, `jobs.rate` | `dashboard` |
| `jobs.decideResponse` | `dashboard`, `jobs.responses`, `inbox.list` |
| `profile.availability`, `admin.resolveReport` | `dashboard` |
| `profile.update` | `dashboard` + profile refetch |
| `profile.updatePhoto`, `profile.removePhoto` | `auth.me`, `dashboard` |
| `inbox.open` | `inbox.list` |
| `inbox.send` | `inbox.messages`, `inbox.list` |
| `inbox.markRead` | `inbox.list`, `notifications.list` |
| notification mark-read mutations | `notifications.list` |

## UI state conventions

- `notice` + `flash()` drives the fixed green success toast, cleared after 2.8 seconds.
- `mutationError()` shows the server message or a generic fallback.
- Sonner is used for auth messages and new-notification count toasts.
- Auth error messages also use `.auth-error` inline styling.
- Modals use `.modal-scrim`; clicking the scrim closes most of them.
- Mobile navigation uses `mobileNavOpen` and a scrim.

## Styling system

`client/src/index.css` defines brand tokens and all application classes.

### Brand tokens

| Token | Value / purpose |
|---|---|
| `--green` | `#0B5D43`, primary Mjengo Green |
| `--green-dark` | dark green for headings |
| `--red` | `#B7432d`, terracotta accent and destructive actions |
| mustard, sand, paper, ink, muted, line | supporting palette and surfaces |

Typography:

- `DM Sans` for interface copy;
- `Space Mono` for labels, IDs, dates, and money.

Common class families:

- `.app-shell`, `.sidebar`, `.topbar`
- `.auth-shell`, `.auth-card`, `.role-switch`
- `.panel`, `.metric-card`, `.status-pill`
- `.fundi-card`, `.opportunity-card`, `.response-card`
- `.job-modal`, `.modal-scrim`
- `.chat-*`, `.inbox-*`, `.notification-*`
- `.account-*`, `.photo-*`
- `.toast`, `.empty-state`

Responsive breakpoints:

| Width | Behaviour |
|---|---|
| ≤1100px | fundi grid becomes two columns; job rows stack |
| ≤820px | sidebar becomes off-canvas with scrim; grids become single column; profile aside hidden |
| ≤560px | full-width buttons, single-column forms, bottom-sheet drawer |

Animation is intentionally short: `fade-in`, `slide-in`, `lift-in`, and a small live pulse.

## Scaffolded but unused frontend code

The repository contains a generated shadcn/Radix layer that is not part of the rendered app:

- `components/DashboardLayout.tsx` and its skeleton;
- `pages/ComponentShowcase.tsx`;
- `src/_core/hooks/useAuth.ts`;
- most of `src/components/ui/*`;
- `hooks/useMobile.tsx` when used outside the unused sidebar.

`App.tsx` uses only `TooltipProvider` and the Sonner `Toaster`; `NotFound.tsx` uses a few shadcn primitives. Do not assume changes to the scaffold layer affect production UI without checking imports.

## Known frontend rough edges

- Client overview “View all” links use DOM `nth-of-type` clicks rather than `setActiveNav`.
- The fundi directory “Filters” button, opportunity “Save job” icon, and admin “View report” eye icon have no handlers.
- `sonner.tsx` reads `next-themes`, while `App.tsx` uses a separate local `ThemeProvider`; there is no theme switcher.
- Photo MIME type is checked in the browser, but the 5 MiB size limit is enforced only after server decode.
- Some mutation failures are only logged by the React Query cache subscribers because they have no `onError` handler.
