This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string. |
| `AUTH_SECRET` | yes | NextAuth session signing key. |
| `CRON_SECRET` | no | Enables `POST /api/cron/sync`. Unset, that endpoint returns 503. |

## Scheduled maintenance

Two things need to happen as time passes rather than in response to a user action:
recurring transactions coming due, and projected SP deposits being regenerated. Pages
schedule this with `after()` so it runs once a response has been sent (throttled and
self-locking — see `lib/sync.ts`), which means an active user's data stays current
without any scheduler at all.

For users who aren't active, point a cron at:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-host/api/cron/sync
```

It walks every user in batches and is safe to run as often as you like — the work is
idempotent, and a failure for one user doesn't stop the rest of the run.

## Tax year data

`lib/tax-slabs.ts` holds NBR slabs keyed by income year. Bangladesh's Finance Act moves
these most years; adding a year is a single entry in `TAX_YEARS`. Until a year is added,
`resolveTaxYear` falls back to the most recent ruleset it has and flags the answer as an
approximation rather than presenting the wrong year's figures as authoritative.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
