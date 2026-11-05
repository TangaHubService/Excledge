-- Which RRA pull last delivered this import line; drives the "New" / "Sent again" markers.
ALTER TABLE "rra_import_items" ADD COLUMN "lastPulledAt" TIMESTAMP(3);
