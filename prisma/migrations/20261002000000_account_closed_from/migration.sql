-- Deleting an account from a month closes it from that month on instead of erasing its history.
ALTER TABLE "Account" ADD COLUMN "closedFrom" DATE;
