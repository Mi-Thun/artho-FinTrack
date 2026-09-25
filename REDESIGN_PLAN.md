# WealthFlow redesign plan

Branch: `redesign`. Each phase is its own commit. Rules: no changes to financial
calculations, projection logic, or the database schema; server actions change only where a
bug fix needs it (noted below). Lakh formatting, Bangla/Western numerals, Islamic-mode
wording and App Lock must keep working with every new component.

## Status

| Phase | Scope | Status |
|---|---|---|
| 0 | Bug fixes (section 2 of the brief) | **Done** — see notes below |
| 1 | Design system: tokens, typography, shared components | Not started |
| 2 | Navigation and IA: grouped sidebar, lists out of modals, quick-add | Not started |
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

### Verification so far

- `npm run build`, `eslint`, `tsc` (source) and `vitest` (144 tests, including new
  `dates`, `rates` and `localiseAmountsInText` tests) pass.
- **Not done yet:** a manual pass through every page in light/dark at
  1440/1024/768/390, in both numeral systems and finance modes. That needs a
  signed-in session against the local database.

## Phases 1–4: plan

### Phase 1: design system
- Tokens in `app/globals.css`: indigo brand, neutral scale, semantic success, danger,
  warning and info with AA-checked foregrounds in both themes. The current
  `--status-warning` (#d97706) is under 4.5:1 on white for small text and needs a
  darker text variant. Chart axis colours move onto tokens.
- Typography: page title 24/600; sentence-case section titles (drop the uppercase
  `Card` title); `tabular-nums` on all money.
- Components:
  - `PageHeader` v2: title, description, primary action, and a "⋯" overflow menu for the
    rest (collapses on mobile).
  - `StatCard` (with delta and `InfoHint`), `SectionCard`, `MoneyText`, `InfoHint`,
    `EmptyState`, `Skeleton`, `Toast`.
  - `DataTable`: sticky header, right-aligned numbers, "⋯" row actions, pagination hidden
    when rows ≤ page size, stacked cards under 640px.
  - `FormSheet`: a right-side sheet for Add/Edit, with inline errors from server-action
    state.

### Phase 2: navigation and IA
- Grouped sidebar: Overview, Money, Wealth, People. Collapsible icon rail on desktop;
  fix the footer clipping and horizontal scroll; keep the mobile drawer.
- Footer menu: Profile, Settings, Backup & Restore, Subscription (Coming soon),
  explicit Light/Dark/System options, Log out.
- Own pages instead of modals: Budgets (exists), Recurring, Income Ledger, Goals sub-tabs
  (Projection, Plan, Salary plan, Milestones), Backup & Restore. This removes every
  stacked modal and every long list inside a modal.
- Global "+ New" quick-add (Transaction, Transfer, SP, DPS, Loan) on the `N` shortcut.

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
