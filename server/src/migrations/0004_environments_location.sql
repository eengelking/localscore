-- Optional short place label for where an environment lives, physically or
-- logically ("Building 4, rack 12", "us-east-1"). Plain text, not markdown,
-- not involved in scoring or the interview.
ALTER TABLE environments ADD COLUMN location TEXT NOT NULL DEFAULT '';
