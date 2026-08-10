-- A possible-duplicate report is a user annotation. It never deletes a row or
-- changes provider evidence; it simply gives the client a durable review flag.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS duplicate_reported boolean NOT NULL DEFAULT false;
