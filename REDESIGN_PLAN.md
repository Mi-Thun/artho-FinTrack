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
| 3 | Page-by-page redesign | **Done** — see Phase 3 notes |
| 4 | Global polish: skeletons, toasts, a11y pass, responsive | **Done** — see Phase 4 notes and the checklist |

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

### Phase 3: pages (done)

**Decisions** (the user asked me to choose):

1. **Transfers get a new `Transfer` table.** This is an additive migration,
   `20260926120000_add_transfers`; no existing table or calculation changes. Two
   INCOME/EXPENSE transactions would have been counted by every income, spending and
   savings-rate figure. A transfer only moves the two balances, so net worth and cash
   totals are unchanged by design. It's included in backup and restore (backup v8;
   older files restore with no transfers). **Run `npm run db:migrate` once** on your
   database.
2. **Editing an account balance** keeps the warning and doesn't create an "Adjustment"
   transaction. That transaction would show up as income or spending.
3. **Linking a loan to an account** is skipped. It would change how lending affects cash,
   which is financial logic and needs its own decision.

**Charts** follow the dataviz method:
- The category palette is the validated reference order, as `--series-1…8` tokens with
  separate light and dark steps. It passes the validator in both modes, and dark mode
  also passes contrast.
- In light mode, three hues are below 3:1 against the surface, so every chart has a
  legend with values or direct labels, plus a "Show data" table.
- Income, expense and net use slots 1–3, which pass on all pairs. Status green and red
  stay reserved for states.
- Every chart has one y-axis, a hover tooltip, and compact ৳ ticks (৳50K / ৳1.2L / ৳1Cr).

**Pages:**
- **Dashboard.**
  - Hero: net worth = cash + SP + DPS − bank loans + net lending. It's composed from the
    existing `computeNetWorth` and `lendingTotals`, with the change since last month.
  - This month's income, spending and savings rate in a compact three-up row.
  - Secondary row: cash, investments ("DPS starts Mar 2031" when not started), passive
    income, net lending, lifetime income and average spend.
  - Net-flow chart: income and expense bars plus a net line, 12 months, with gaps for
    months without data.
  - Spending donut: top 5 + Other, total in the centre, amounts and %, and a message
    instead of a chart when there are fewer than two categories.
  - Budgets show "৳X left" / "৳X over".
  - Upcoming is split into Payouts and Milestones, with relative dates ("in 38 days").
  - Recent transactions (5) with View all.
- **Transactions.**
  - Search (note, category, account), filters by type, category and account, and
    removable chips with "Clear all".
  - Rows are grouped by day with daily net and account pills; "Sort by amount" switches
    to a flat list.
  - The Add sheet has an Expense / Income / Transfer switch, a large amount field,
    categories filtered by type with recent-category chips, and local "today".
  - A Transfers section for the month.
  - CSV import shows a format guide, a downloadable template, and a preview (rows to
    import, skipped rows with reasons, unmatched names) before anything is written.
- **Accounts.** Card grid grouped into Bank / Mobile wallet / Cash with subtotals and a
  total. Balances keep poisha. Each card links to that account's transactions.
  "Transfer between accounts" is in the menu and in quick-add (N).
- **Income ledger.** Adds a monthly income chart for the selected year (or the latest
  year).
- **Investments.**
  - Tabs: SP and DPS.
  - SP rows show a short scheme badge, the year-3 rate (Y1/Y2/Y3 in the tooltip), the
    next payout amount and date, the maturity date, and "Matured".
  - DPS rows show installment progress (paid/total) and "Starts Mar 2031".
  - Add SP and Add DPS show live previews: payout every 3 months after tax, maturity,
    total paid in, and maturity value. They use lib/deposit-planner's own functions,
    not new maths.
- **Goals & projection.**
  - A projected accumulated-savings chart with milestone target lines and dots, an SP
    target marker, and a compact assumptions summary.
  - The month-by-month table is grouped by year: expand a year for its months, and a
    month for its inline breakdown (the former popover content, kept verbatim). There's
    no inner scroll and no pagination.
  - "Convert to real SP" on each planned deposit, behind a confirmation.
- **Lending.**
  - One list grouped by person, with initials avatars, net ("owes you" / "you owe") and
    overdue badges; each person expands to their records.
  - Each record has Record repayment (preselected, shows what's outstanding, "Full
    amount"), Settle, Reopen and Delete.
  - Record a loan has a Lent/Borrowed switch and suggests existing people.
- **Household.** Onboarding: a 3-step explainer, Create household, and Join with an invite
  code or link (`openInvite` accepts either).
- **Profile.** Avatar, name, email and "member since". A password change that checks the
  current password (`changePassword`, bcrypt). There's still no email verification
  because the app has no outbound email.
- **Settings.**
  - Language & numbers and Finance mode are separate cards, each with a live preview.
    One form saves both, since the action saves all three fields together.
  - "What changes?" is collapsible.
  - App lock shows whether a PIN is set; Remove now uses the in-app confirmation, which
    was the last `window.confirm`.

**Verification.**
- Unit tests (148, including relative dates and moneyExact) and integration tests (30,
  including transfer balances, the same-account guard, and the transfer backup
  round-trip) pass, as do lint, tsc and the production build.
- The browser sweep covers all 17 pages at 1440/390 in light/dark, with no console errors
  or overflow.
- Phase 3 flows passed in the browser:
  - A ৳2,000 transfer took City from ৳4,80,000 to ৳4,78,000 and Bkash from ৳2,300 to
    ৳4,300, with the income strip unchanged.
  - Search plus chips.
  - The CSV preview reported "2 of 3 rows", with Import disabled until a file is chosen.
  - Expanding a projection month.
  - Converting a planned SP (20 → 19 planned).
  - Repayment with Full amount (৳15,000).
  - A wrong-then-right password change.
  - The Bengali numerals preview "৳১২,৩৪,৫৬৭ · ২৬ Sep ২০২৬".
  - Preferences save with a toast.
- The Phase 1 and 2 suites pass after updating for the new entry form.

### Phase 4: polish (done)

- **Keyboard and screen readers.**
  - A "Skip to content" link is the first tab stop and moves focus to `<main>`.
  - Links, summaries and the segmented controls get a solid 2px focus ring in the link
    colour (6.3:1 light, 6.1:1 dark) when reached by keyboard. The translucent `--ring`
    was too faint.
  - **Dialogs didn't trap focus.** Checked in the browser across the entry sheet, Edit
    profile and a delete confirmation: after the last control, focus fell through Base
    UI's closing guard to `<body>` and into the page behind. Dialog and sheet popups now
    wrap Tab / Shift+Tab themselves (`components/ui/focus-trap.ts`). Checked: 25 Tabs
    stay inside, Escape closes, and focus returns to the opening button. Row menus open
    with Enter and move with the arrow keys.
  - `prefers-reduced-motion` turns off animations and transitions.
- **Settings now take effect.** Before the redesign, neither Language nor Finance mode
  changed anything outside the Settings page.
  - Language drives the sidebar, the account menu and the "+ New" menu (new Bangla
    strings, covered by the "every key has Bangla" test), plus `lang` on the app shell.
  - Finance mode renames the DPS "Interest rate" / "Profit rate" fields, the dashboard's
    "Passive income" / "Profit income" tile, and the projection breakdown's "SP interest"
    / "SP profit".
  - Page body text is still English: full translation needs the dictionary extended
    beyond navigation.
- **Loading placeholders** (`components/PageSkeleton.tsx`) for Dashboard, Transactions and
  the Goals tabs (under the Goals header, so the header and tabs stay put), plus a
  generic fallback.
- **Dates.** `DateInput` keeps the accessible native picker but shows the chosen day in
  the app's format underneath ("Sat, 26 Sep 2026", localised). The native picker's
  09/26/2026 is easy to misread.
- **LocaleProvider.** Client components can use the user's formatter without passing it
  down through every level.
- **Tablet widths.** Dashboard, Transactions, Accounts, Investments, Goals, Lending and
  Settings at 768 and 1024: no overflow; layouts reflow.

## Acceptance checklist

- [x] **All bugs in section 2 fixed** — notes per bug in Phase 0. Bug 17 is a rename only,
  as agreed.
- [x] **Every item in section 1 reachable.** The old dialogs became pages: Budgets,
  Recurring, Income ledger, Goals tabs, Backup & restore. The old Dashboard tiles
  (Lifetime income, Avg monthly spend) are kept.
- [x] **No stacked modals, no long lists in modals, no duplicate titles.**
- [x] **Every form:** visible labels, inline errors, local default date, grouped money
  input, the same button row, and a date readout.
- [x] **Every destructive action confirms,** in-app; no `window.confirm` left. Restore
  requires typing REPLACE.
- [x] **Light, dark and system themes; Bangla and Western numerals; Conventional and
  Islamic mode; 390/768/1024/1440** — checked in the browser against a seeded test
  database. Bangla *language* covers navigation only (see Phase 4).
- [x] **`npm run build` and lint pass;** 148 unit and 30 integration tests pass.

**Not done / needs you:**
- **Email verification.** The app has no outbound email.
- **Linking loans to accounts.** Skipped: it's a financial-logic change.
- **Full Bangla page text.**
- **Screen-reader pass.** I checked the structure (names, roles, focus) but haven't used
  NVDA or VoiceOver.
- **Migration.** Your database needs `npm run db:migrate` for the Transfer table.

## Follow-up: Income ledger built from transactions

Requested after Phase 4: income entered in Transactions flows into the Income ledger, and
the ledger can't be added to separately.

- **Schema.** `Transaction.taxWithheld` (additive migration
  `20260926140000_add_transaction_tax_withheld`, default 0). It records tax deducted at
  source on income. `amount` is what arrived; no balance or income figure is adjusted by
  the tax. It's only stored on INCOME.
- **Entering income.** The Add/Edit form shows "Tax withheld" when Income is selected.
  Transaction rows show "tax ৳900". CSV export, backup (v9) and restore carry it.
- **Income ledger** (`/income-ledger`) is now a read-only view of income transactions:
  - lifetime, tax, this-year and selected-year totals
  - a monthly chart plus a month-by-month table (each month links to that month's
    income in Transactions)
  - every entry with source, account, amount and tax, with an "Edit in Transactions"
    link
  - amounts exact to the poisha
  - there's no add form; "Add income" opens the Transactions entry sheet
- **Old manual entries** (`IncomeLedgerEntry`) are no longer shown or counted. A banner
  offers "Delete old entries" behind a confirmation. They're kept until then, and they're
  in any earlier backup.
- **Dashboard.** Lifetime income now comes from income transactions only, the same
  figure as the ledger.
- **CSV import:**
  - an optional `tax` column
  - "Create missing categories" (on by default in the preview)
  - rows already recorded (same date, type, amount, note) are skipped, so re-importing
    is safe
  - the result toast reports imported / already recorded / unreadable / new categories
- **Your income history** is in `income-history.csv` (not committed; it's personal data):
  - 73 rows, ৳18,73,542.63 income, ৳13,104 tax; net ৳18,60,438.63 matches the list's Total
  - no account, so balances are untouched
  - "SGC-Sep 26" corrected to 2026-09-26
- **Verified** against the throwaway database in the browser:
  - the first import brought in all 73 rows, and a re-import skipped all 73
  - ledger tax total ৳13,104
  - 2025 total ৳6,53,281 with ৳5,004 tax, matching the list month by month
  - the old-entries banner clears after deleting
  - integration tests (33) cover tax on import, duplicate skip, category creation, no
    balance change, no tax on expenses, and the backup round-trip

## Follow-up: income counted in the month it's for, by type

The ledger grouped income by the day the money arrived, so May 2023's salary (paid
1 June) landed in June, and every EWU salary showed a month late. Everything was also
filed under four broad categories.

- **Schema.** `Transaction.incomeMonth` (nullable DATE, additive migration
  `20260926160000_add_transaction_income_month`). It's the month an income is *for*.
  Null means the month of `date`, and it's only stored when the two differ and only on
  INCOME. `date` still drives balances and cash flow (dashboard, Transactions).
- **Entering income.** An "Income for" month field appears when Income is selected. Rows
  in Transactions and the ledger show "for May 2023". Export (`month` column), backup
  (v10) and restore carry it.
- **Income ledger:**
  - years, totals and months use the "for" month
  - a stacked monthly chart by income type, with a legend and "Show data". Colours follow
    lifetime rank, so they're stable across years; past 7 types they share "Other".
  - a "By type" table: entries, income, share and tax
  - month rows list their types and filter the ledger to that month (`?month=YYYY-MM`)
- **CSV import:**
  - an optional `month` column (YYYY-MM)
  - "Update rows already recorded": matching rows take the file's category, month and
    tax. Amounts, dates and balances aren't touched, so a corrected file fixes an
    earlier import.
- **`income-history.csv`** regenerated with seven types:
  - Salary (SGC), Salary (EWU)
  - Festival bonus, Profit share, SP profit, Interest, Gift
  - a `month` from each SGC/EWU label. Four rows move: SGC-May 23 → May, and EWU-Jul,
    Aug and Sep 23 each move back a month.
  - every month May 2023–Sep 2026 has one SGC salary, except Aug 2023, which has none
    in the source list
- **Verified** in the browser: imported the old file, then re-imported the corrected one
  with update on. Result: 0 new, 73 updated, no duplicates. May 2023 = SGC-May 23 only;
  June = SGC-Jun 23 only. Integration tests are now 35.

## Follow-up: "+ New" removed

At the user's request, the "+ New" menu (`components/QuickAdd.tsx`) and its **N** shortcut
are gone from the sidebar and the mobile top bar. Each page's own "Add …" button, and the
`?new=` links that open those forms, still work.

## Follow-up: Accounts are view-only

At the user's request the Accounts page is a record they update by hand — "how much I have
at the start of each month" — and nothing else reads or changes it.

- Transactions, recurring entries and CSV imports no longer take an account or move a
  balance. The Add/Edit form has no Account field; an `account` column in a CSV is ignored.
- Transfers are removed (the tab, the Transfers card and their actions). The `Transfer`
  table stays in the schema and in backups, so nothing is lost.
- Net worth (Dashboard, Household) = SP + DPS − bank loans + net lending. Account cash is
  no longer part of it, and the "Cash on hand" card is gone.
- Account columns and filters are gone from Transactions, Recurring, the Income ledger and
  the CSV export. The Accounts page says it's view-only.
- No schema change: `Transaction.accountId` etc. remain (all null in the user's data).
