-- Income year 2025-26 (tax year 2026-27) as NBR's eReturn site (etaxnbr.gov.bd) computes it.
-- Returns it accepted use the Finance Act 2024 rates and bands (৳3.5 lakh tax-free, then 5%),
-- not those of Paripatra 2025-26 §1.1, tax Sanchayapatra profit at the slab rates, and take
-- the 3% rebate limit on total income. The minimum tax and the rest stay as the Paripatra
-- sets them. The site's single "freedom fighter / July fighter" box gives both one band.
UPDATE "TaxRuleYear" SET
  "source" = 'NBR eReturn site, tax year 2026-27: Finance Act 2024 rates and bands; Paripatra 2025-26 for the minimum tax',
  "thresholdGeneral" = 350000,
  "thresholdFemaleOrSenior" = 400000,
  "thresholdThirdGender" = 475000,
  "thresholdDisabled" = 475000,
  "thresholdFreedomFighter" = 500000,
  "thresholdJulyWarrior" = 500000,
  "slabs" = '[{"width":100000,"rate":0.05},{"width":400000,"rate":0.1},{"width":500000,"rate":0.15},{"width":500000,"rate":0.2},{"width":2000000,"rate":0.25},{"width":null,"rate":0.3}]',
  "sanchayapatraFinalTax" = false,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'published-2025-26';
