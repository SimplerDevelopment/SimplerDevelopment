The unjournaled `0011_snapshot.json` belongs to the retired migration chain.
Its parent snapshot is absent. It is retained here for reference, outside the
active `meta/` directory so Drizzle does not treat it as a second active root.

The current chain is `0000_snapshot.json` → `0032_snapshot.json`. Migration
0032 was generated against a local database with the baseline and all existing
manual migrations applied. It adds missing objects and preserves existing
historical column types and indexes; it does not perform a wholesale schema push.
