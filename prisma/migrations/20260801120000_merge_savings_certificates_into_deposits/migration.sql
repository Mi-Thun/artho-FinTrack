-- Merges SavingsCertificate into FixedDeposit and removes projected deposits from the
-- holdings table. Three defects motivate this, all confirmed in the code:
--
--   1. The same certificate produced different answers depending on which page it was
--      entered on. computeNetWorth read FixedDeposit and had no knowledge of
--      SavingsCertificate, so a Sanchayapatra recorded on /sanchayapatra was invisible
--      to net worth — and therefore to the zakat base.
--   2. The NBR worksheet emitted both tables as separate asset lines, so a certificate
--      recorded in both places was double-counted on the statement of assets.
--   3. syncProjectedSpDeposits wrote HYPOTHETICAL future purchases into the same table
--      as real holdings (source = 'PROJECTED'), and computeNetWorth filtered by date but
--      not by source. A plan of "buy 1 lakh monthly" therefore added money the user
--      never spent to their net worth, and to the wealth they owe zakat on.
--
-- Data is copied before anything is dropped.

-- ============================================================================
-- 1. FixedDeposit gains the scheme metadata SavingsCertificate carried.
-- ============================================================================
ALTER TABLE "FixedDeposit"
  ADD COLUMN "scheme"         "CertificateScheme",
  ADD COLUMN "holderType"     "CertificateHolder" NOT NULL DEFAULT 'SINGLE',
  ADD COLUMN "registrationNo" TEXT,
  ADD COLUMN "encashedAt"     TIMESTAMP(3),
  ADD COLUMN "note"           TEXT;

-- ============================================================================
-- 2. Copy every savings certificate across.
-- ============================================================================
-- Rates are FixedDeposit's source of truth for the projection engine, but a
-- SavingsCertificate never stored one — its rate came from the scheme registry. Seed all
-- three years from that statutory rate so projections keep working; the user can edit
-- them afterwards if a certificate was bought at a different rate.
INSERT INTO "FixedDeposit" (
  "id", "userId", "label", "principal", "openedDate",
  "rateY1", "rateY2", "rateY3", "termMonths",
  "scheme", "holderType", "registrationNo", "encashedAt", "note",
  "createdAt", "updatedAt"
)
SELECT
  c."id",
  c."userId",
  c."label",
  c."principal",
  c."purchaseDate",
  rates.rate,
  rates.rate,
  rates.rate,
  rates.tenure,
  c."scheme",
  c."holderType",
  c."registrationNo",
  c."encashedAt",
  c."note",
  c."createdAt",
  c."updatedAt"
FROM "SavingsCertificate" c
CROSS JOIN LATERAL (
  -- Mirrors SCHEMES in lib/sanchayapatra.ts as of this migration.
  SELECT
    CASE c."scheme"
      WHEN 'FIVE_YEAR_BSP'      THEN 0.1128
      WHEN 'THREE_MONTH_PROFIT' THEN 0.1104
      WHEN 'PARIWAR'            THEN 0.1152
      WHEN 'PENSIONER'          THEN 0.1176
      WHEN 'POST_OFFICE_FD'     THEN 0.1132
      ELSE 0
    END AS rate,
    CASE c."scheme"
      WHEN 'THREE_MONTH_PROFIT' THEN 36
      WHEN 'POST_OFFICE_FD'     THEN 36
      ELSE 60
    END AS tenure
) rates
-- Defensive: ids are cuids from the same generator, so a collision is essentially
-- impossible, but a failed insert here would abort the whole migration.
WHERE NOT EXISTS (SELECT 1 FROM "FixedDeposit" f WHERE f."id" = c."id");

DROP TABLE "SavingsCertificate";

-- ============================================================================
-- 3. Projected deposits are hypotheses, not holdings.
-- ============================================================================
-- These rows were regenerated from Plan Assumptions on every sync, so deleting them
-- loses nothing — the projection page recomputes the same figures on the fly. What it
-- does remove is imaginary money from net worth and from the zakat base.
DELETE FROM "FixedDeposit" WHERE "source" = 'PROJECTED';

ALTER TABLE "FixedDeposit" DROP COLUMN "source";
DROP TYPE "DepositSource";

-- ============================================================================
-- 4. Index for the per-scheme ceiling lookups.
-- ============================================================================
CREATE INDEX "FixedDeposit_userId_scheme_idx" ON "FixedDeposit"("userId", "scheme");
