-- Up Migration

-- The surface is called the hall, and this key is not an internal identifier:
-- the admin configuration page renders it verbatim as each setting's heading, so
-- an operator reads it (apps/web/src/app/admin/config/settings-control.tsx). The
-- registry in config/settings.ts moves with it; this carries any row an operator
-- has already written across, because the value is their configuration and the
-- rename must not silently discard it.
UPDATE config SET key = 'hall.banner' WHERE key = 'room.banner';
UPDATE config SET key = 'hall.signin_message' WHERE key = 'room.signin_message';

-- Down Migration

UPDATE config SET key = 'room.banner' WHERE key = 'hall.banner';
UPDATE config SET key = 'room.signin_message' WHERE key = 'hall.signin_message';
