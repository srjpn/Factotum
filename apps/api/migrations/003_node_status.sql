-- The last status the monitor reported, so a change is logged once when it is detected.
ALTER TABLE nodes ADD COLUMN reported_status text NOT NULL DEFAULT 'pending';
