# WealthFlow redesign plan

Branch: `redesign`. Each phase is its own commit. Rules: no changes to financial
calculations, projection logic, or the database schema; server actions change only where a
bug fix needs it (noted below). Lakh formatting, Bangla/Western numerals, Islamic-mode
wording and App Lock must keep working with every new component.

## Status

| Phase | Scope | Status |
|---|---|---|
| 0 | Bug fixes (section 2 of the brief) | **Done** — see notes below |
| 1 | Design system: tokens, typography, shared components | **Done** — see Phase 1 notes |
| 2 | Navigation and IA: grouped sidebar, lists out of modals, quick-add | **Done** — see Phase 2 notes |
| 3 | Page-by-page redesign | Not started |
| 4 | Global polish: skeletons, toasts, a11y pass, responsive | Not started |

## Phase 0: bug notes

New shared pieces that Phase 1 builds on:

- `lib/dates.ts`: `todayInputValue()` / `thisMonthInputValue()` in the app time zone
  (`Asia/Dhaka`, overridable with `NEXT_PUBLIC_APP_TIME_ZONE`).
- `lib/rates.ts`: `rateToPercent` / `percentToRate`, drift-free conversion between stored
  fractions and percentages in forms.
- `lib/i18n.ts` `localiseAmountsInText`: re-renders amounts inside free text through the
  user's formatter.
- `components/Field.tsx`: visible label, required marker, hint. `EditField` now wraps it.
- `components/MoneyInput.tsx`: ৳ prefix and lakh grouping while typing. Accepts Bengali
  digits and submits a plain number, so server actions are unchanged.
- `components/ConfirmDialog.tsx`: in-app confirmation, optional type-to-confirm.
  `ConfirmDelete` is rebuilt on it.
- `components/TransactionTypeFields.tsx`, `components/SpSchemeFields.tsx`.
- `Modal` takes an `icon`; `FormActions` / `ModalCancel` give every form the same button row.

| # | Bug | Fix |
|---|---|---|
| 1 | Default date was the UTC day | Every "today" default (Add Transaction, Add SP, Add DPS start month, Income Ledger entry, Record Loan, Record Repayment) uses `todayInputValue()`, the calendar day in Asia/Dhaka. Stored dates are still UTC midnight of the picked day, so reads are unchanged. Unit-tested at 02:30 Dhaka / 20:30 UTC. |
| 2 | Record Repayment date empty | Defaults to today. |
| 3 | `11.219999999999999` in Edit SP | Forms prefill with `rateToPercent` (rounds to 4 dp). Actions store with `percentToRate` (rounds to 6 dp), so new saves don't drift either. Applies to SP, DPS and Plan Assumptions. |
| 4 | Nested/duplicate labels | Household "Household name" and Record a Loan "Person"/"Note" were a `<label>` inside a `<label>`; now one `Field` each, full column width. |
| 5 | Categories not filtered by type | `TransactionTypeFields` filters categories by the chosen type and remounts the category select empty when the type changes (Add/Edit Transaction, Add Recurring). **Server change:** create/update transaction and create recurring now drop a category whose kind doesn't match the type. |
| 6 | Add SP rate fields always shown | For a government scheme, the rate and term show read-only ("11.04% a year · 60-month term — set by the scheme") and no rate is submitted, so the server uses the scheme rate as before. Rate Y1/Y2/Y3 and Term fields appear, required, only for "Other / bank FDR". Edit SP keeps editable rates on purpose: an older certificate keeps the rate it was bought at. |
| 7 | Unlabelled fields | Scheme, Holder, Account Kind, Recurring Type/Account/Category, Income Ledger Date and Import CSV file all have visible labels. Add and Edit use the same `Field`. |
| 8 | Percent units inconsistent | Plan Assumptions takes percentages (10.65) like SP/DPS. **Server change:** `saveDepositPlanConfig` converts with `percentToRate`; the stored value is still a fraction. |
| 9 | Western grouping in milestone labels; raw inputs | Milestone labels are free text the user typed, so they're rendered through `localiseAmountsInText` (e.g. "BDT 6,000,000" → "৳60,00,000", Bengali digits when that setting is on). The stored label is untouched. Every page, the projection table and the trends chart now use `fmt.money`, which respects the Numerals setting; `formatBDT` is no longer imported anywhere. Money inputs use `MoneyInput`. |
| 10 | Milestone Target clipped | The table was wider than the modal: long labels didn't wrap, and the Reached column said "not reached in projection". Labels now wrap, the target never wraps, and the Reached column says "Not reached". **Not visually verified yet** (see below). Phase 2 moves Milestones out of the modal entirely. |
| 11 | Budget states | "No limit" (no budget row) is distinct from a ৳0 limit. Bars are green, then amber at 80%, then red when over, with "Over budget by ৳X" / "৳X left" text so colour isn't the only signal. The clear-limit button shows on every row: enabled with a confirmation when the limit was set this month, otherwise disabled with a tooltip explaining why (no limit, or carried from an earlier month). The dashboard uses the same status logic. |
| 12 | Clicks ignored right after load | Dialog triggers (`Modal`, `ConfirmDialog`) render disabled with `aria-busy` until hydrated, instead of looking live and ignoring the click. Row Edit buttons are plain links and work before hydration. The production build succeeds, but the delay itself hasn't been re-measured in a browser. |
| 13 | Destructive actions unconfirmed | `window.confirm` is gone. Every Delete (transactions, recurring, accounts, ledger, SP, DPS, salary years, milestones, lending records, household members/invites), Encash, Settle and budget Clear goes through `ConfirmDialog`, which says what will happen. Restore Backup needs the file picked inside the dialog, "REPLACE" typed, and offers "Download current backup" first. |
| 14 | Email change without verification | **Server change:** `updateProfile` requires the current password when the email changes (bcrypt check) and shows an error if it's missing or wrong. There's no email delivery in the app yet, so there's no confirmation-link flow; that's Phase 3 once mail is wired up. |
| 15 | Hydration warning on `<body>` | `suppressHydrationWarning` on `<body>`, with a comment naming the extension. |
| 16 | Missing accessible names | User menu ("Account menu for …"), pagination (First/Previous/Next/Last page, Rows per page), month nav (Previous/Next month, Month select) and every icon-only Edit/Delete/Restore button have `aria-label` and `title`. |
| 17 | "Wealth" terminology | Renamed to **Accumulated savings**: the plan's starting net worth plus everything saved since, excluding DPS until maturity. The header has an explanatory tooltip, and the breakdown and dashboard milestone text use the new wording. The calculation is unchanged, as agreed. |
| 18 | Plan Assumptions copy | Now says "…the monthly projection on this page". |
| 19 | Wrong header icons | Edit Profile → pencil, Plan Assumptions → sliders, Salary Plan → calendar range, Milestones → flag, Budgets → pie chart, Income Ledger → book, Recurring → repeat, Import CSV → upload. "+" remains only on Add actions. |

### Verification

Unit checks: `npm run build`, `eslint`, `tsc` and `vitest` (147 tests) pass.

**Browser pass (after Phase 1).** The production build ran against a throwaway Postgres
container seeded with realistic data (5 accounts, 9 months of transactions, budgets
including a ৳0 limit, SPs, a future-dated DPS, the plan, milestones, 30 ledger entries,
loans). Playwright in Chrome took screenshots of every page at 1440 and 390, in light and
dark, then again with Bengali numerals and Islamic mode. It found no console errors and
no horizontal overflow. Scripted flows checked:

- dialog buttons enabled about 0.4–0.5s after navigation (bug 12)
- inline validation errors, grouped money input (12,34,567), category filtering by type
- Escape on an open list keeps the sheet open
- add → "Transaction added" toast; row ⋯ → delete confirm → toast
- no overflow in the Milestones dialog (bug 10 confirmed)
- Plan assumptions in % (10.65); Edit SP rate 11.22 with no drift
- Add SP rate fields only for "Other"; Restore disabled until REPLACE is typed
- Record repayment defaults to today (26 Sep 2026)

**Issues the browser pass found, now fixed:**

- Month pickers showed the raw key "2026-09" instead of "Sep 2026" (existed before the
  redesign).
- StatCard label, ⓘ and scope chip collided when six cards sit in a row. The chip now
  sits under the value.
- Mobile stacked rows: "⋯" took a line of its own, and multi-part values ("৳15,000 (25%
  repaid)") spread across the row. The menu now sits beside the row title and values
  stay grouped. Stat grids are 2-up on phones; the Transactions summary is a compact
  3-up.
- Inline validation never appeared: `invalid` doesn't bubble and React doesn't deliver
  it to a form-level handler. It now uses a native capture listener.
- Escape on an open dropdown inside a sheet or dialog: the dialogs now ignore an Escape
  meant for a nested list, menu or popover. The earlier "failure" came from a flawed
  test, so it's unconfirmed whether this was ever broken; the guard is defensive.
- A failing action raised an unhandled rejection. Now it shows an error toast and the
  dialog stays open (`lib/run-action.ts`); redirects still pass through.
- Account balances rounded ৳6.70 to ৳7. Balances now use `fmt.moneyExact`.
- Under Bengali numerals, chart month labels, donut %, rates, % repaid and pagination
  counts were still Western digits.
- Smaller fixes:
  - Sidebar said "Deposits" for the Investments page.
  - The projection table scrolled inside the card, which hid its pager.
  - Header buttons and projection column names were in title case.
  - SP badges used the full scheme name; they're now short ("3-Monthly").
  - An empty bar showed on "No limit" budgets.
  - The dashboard said nothing for near-limit budgets; it now shows "৳X left".
  - The DPS tile showed ৳0 before the plan starts; it now says "Starts Mar 2031".
  - The upcoming list was cramped on phones.
  - Profile result toasts repeated on reload.

**Still not covered:** 768 and 1024 widths, keyboard-only navigation, and a screen reader.
Date inputs render in the browser's locale (e.g. 09/26/2026); matching the app's
"26 Sep 2026" there needs a custom date picker (Phase 4).

## Phases 1–4: plan

### Phase 1: design system (done)

**Tokens** (`app/globals.css`), with contrast measured on the surfaces they sit on:

| Token | Light | Dark | Notes |
|---|---|---|---|
| `--status-success` | #047857 (5.5:1) | #34d399 (9.5:1) | was #059669, 3.8:1 |
| `--status-warning` | #b45309 (5.0:1) | #fbbf24 (10.9:1) | was #d97706, 3.2:1 |
| `--status-danger` / `--destructive` | #be123c (6.3:1, 5.7:1 on its soft tint) | #fb7185 (6.8:1) | was #e11d48, 4.3:1 on its tint |
| `--muted-foreground` | #5b6075 (5.7:1 on page bg) | #9aa0b6 (7.0:1) | was 4.51:1 on the page background |
| `--link` (new) | #4f46e5 (6.3:1) | #818cf8 (6.1:1) | dark `--primary` as text was 4.1:1 ("Manage" link) |
| Chart axis/grid | `--muted-foreground` / `--border` | same | old hard-coded axis grey was 1.5:1 (dark) |

Tailwind utilities `text-success`, `bg-danger-soft`, `text-link` and so on map to these.

**Typography.** Page titles are 24/600. Section titles are sentence case at 16/600 (the
uppercase grey card header is gone). Table headers are 12px muted. Every amount uses
`tabular-nums`.

**Formatter** (`lib/i18n.ts`). `fmt.day` gives "26 Sep 2026" (ICU's en-IN would give
"Sept"), `fmt.monthYear` gives "Sep 2026", and `fmt.compactMoney` gives ৳50K / ৳1.2L /
৳3.5Cr for chart axes. All follow the Numerals setting. Tables now show dates as
`26 Sep 2026`, not `2026-09-24`.

**Components**:
- `PageHeader`: title, description, optional back link, inline actions, a "⋯" menu for
  link-type actions (e.g. Export CSV), and a slot for controls such as the month picker.
  Every page uses it, including Profile and Subscription.
- `SectionCard` (`Card` is an alias): sentence-case title, description, action.
- `StatCard`: label, value, `InfoHint`, scope chip ("Now", "Lifetime", a month), delta,
  hero size. Replaces `StatTile` everywhere.
- `MoneyText`: tabular amount with a +/− sign as well as colour for income/expense.
- `InfoHint`: an ⓘ popover that replaces helper paragraphs (source tax, SP profit, DPS,
  accumulated savings).
- `EmptyState`, `Skeleton` (the route loading screen now mirrors the real layout), and
  `MonthPicker` (one component in place of four copies).
- `Toaster` + `toast()` + `FlashToast`: create/update/delete toasts; results reported
  through redirect params (profile update, restore) also show as toasts.
- `RowActions`: a row's "⋯" menu with Edit, reversible actions (Pause/Resume, Reopen), and
  confirm actions. Destructive items sit last behind a divider. It replaces the icon
  strips in every table except Budgets, which keeps its explained pencil/clear buttons
  from bug 11.
- `ConfirmDialog`: can now be controlled (opened from a menu), and takes an optional
  success toast.
- Forms:
  - `ValidatedForm` renders inline error messages under each `Field` (not browser
    bubbles) and focuses the first invalid field.
  - `ModalForm` stays open with a spinner while saving, then closes and toasts.
  - `FormActions` gives one button row everywhere: primary on the right, Cancel beside
    it, stacked on phones.
  - `Modal` can present as a right-side sheet (`presentation="sheet"`); Add transaction
    uses it.
  - Dialogs close when a redirecting action changes the URL.
- Tables: `<Table responsive>` stacks each row into a labelled card below 640px
  (`TableCell label`, `primary`, `actions`). Header cells are sticky; `maxHeight` gives
  an internally scrolling table with a pinned header. Pagination hides when everything
  fits on one page.
- Duplicate titles are gone: the Budgets, Income ledger, Salary plan and Milestones
  dialogs no longer contain a card repeating the dialog title.

**Deliberately left for Phase 2.** Some lists still live in dialogs: Recurring, Budgets
(from Transactions), Income ledger, Salary plan and Milestones. Those dialogs have
`closeOnNavigate={false}` so their pagination still works; Phase 2 moves them to pages.
Accounts are still a table until Phase 3's card grid.

### Phase 2: navigation and IA (done)

**Sidebar** (`components/Sidebar.tsx`):
- Grouped as Overview (Dashboard), Money (Transactions, Accounts, Budgets, Recurring,
  Income ledger), Wealth (Investments, Goals & projection) and People (Lending,
  Household).
- The nav scrolls on its own. The account footer is fixed and never clips, and there's
  no horizontal scroll.
- On desktop it collapses to an icon rail. The state lives in a cookie (`wf-sidebar`),
  so the server renders it collapsed from the first paint with no flash. The mobile
  drawer is kept.
- The footer menu has Profile, Settings, Backup & restore, Subscription ("Soon"),
  explicit Light/Dark/System theme options (replacing the cycling icon) and Log out.

**Quick add** (`components/QuickAdd.tsx`):
- A "+ New" menu in the sidebar (and the mobile top bar), opened with the **N** key
  anywhere outside a text field or open dialog.
- Items: Transaction, Recurring transaction, Account, SP, DPS and Loan record. Each
  goes to the page that owns the form with `?new=<form>`; that page's `Modal
  openParam` opens it and then removes the param.
- Transfer isn't offered yet: there's no transfer model (see Phase 3 decisions).

**Lists moved out of dialogs.** There are no stacked dialogs left, and every item stays
reachable:

| Was | Now |
|---|---|
| Transactions → Recurring dialog (list + nested Add dialog) | `/recurring` page |
| Transactions → Budgets dialog (duplicate of `/budgets`, with its own actions file) | the `/budgets` page; `BudgetsPanel` and `transactions/budget-actions.ts` deleted |
| Accounts → Lifetime Income Ledger dialog | `/income-ledger` page, with lifetime / tax / this-year totals, a year filter, and an ⓘ explaining how it relates to income transactions |
| Goals → Plan Assumptions / Salary Plan / Milestones dialogs | Goals tabs: `/goals` (projection), `/goals/plan` (inline form + toast), `/goals/salary`, `/goals/milestones` |
| Profile → Data Backup card | `/backup` (Backup & restore), which shows when a backup was last downloaded on this device |
| Transactions header: Recurring, Budgets, Import CSV, Export CSV buttons | the "⋯" menu; Import opens its dialog through `?new=import` |
| `/deposits`, `/sanchayapatra` | `/investments` (redirects in `next.config.ts`) |

**Server-side routing changes** (paths only, no logic):
- The investments actions and the goals actions' revalidate paths point to
  `/investments`.
- Goals actions revalidate the whole `/goals` layout and redirect edits to
  `/goals/salary` / `/goals/milestones`.
- The recurring and ledger actions also revalidate their new pages.
- Restore redirects to `/backup?restore=…`, and the integration tests were updated to
  match.

**Verification.** Unit tests (147) and integration tests (27, run against the throwaway
database) pass. In the browser:
- screenshots of all 17 pages at 1440/390 in light and dark, with no console errors or
  overflow
- redirects, quick-add to all six forms, N shortcut
- Import CSV from the ⋯ menu, sidebar collapse persisting across a reload, theme radio
- the Plan form saving with a toast, salary edit redirecting back to its tab, the mobile
  drawer
- the Phase 1 flow suite retargeted at the moved pages

### Phase 3: pages
Implemented as described in the brief (Dashboard hero and charts, Transactions
toolbar/grouping/Transfer, Accounts card grid, Income Ledger page, Investments tabs,
Goals chart + year-grouped projection, Lending merged list, Household onboarding,
Profile/Settings/Subscription). Items that need a decision before building:
- **Transfer** between accounts has no model today. Options: two linked transactions,
  or a `transferId`/type (a schema change, so it needs sign-off).
- **Balance adjustment on account edit**: record it as a transaction in an "Adjustment"
  category (no schema change) or just warn (done in Phase 0).
- **Loan ↔ account link** so cash balances move needs a column on `PersonalLoan`
  (schema change).
- **Email verification flow** needs outbound email.

### Phase 4: polish
Skeletons per route (`loading.tsx`), toasts for every mutation (server-action result
state), pending/spinner submit buttons, focus rings and keyboard paths through menus and
sheets, and a full pass over numerals, Islamic mode, themes and breakpoints.
