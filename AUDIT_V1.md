# LOBSTER AGENDA V1 — AUDIT REPORT

**Date**: 2026-03-03
**Scope**: Migration 0012, fairness engine, API routes, ledger consistency, swap flow
**Auditor posture**: Adversarial. Assume everything is broken until proven safe.

---

## RISK AREA 1: Enum Mutations

**Verdict: ✅ SAFE**

Searched migration 0012 for: `DROP`, `ALTER TYPE`, `RENAME`, any mutation of existing Postgres enums (`slot_type`, `assignee`, `validation_status`).

- Zero enum mutations found
- All schema changes use `ADD COLUMN IF NOT EXISTS` — idempotent
- New tables use `lobster_` prefix — no collision with existing `studio_*` tables
- Legacy `assignee` enum column untouched — old UI continues working
- INSERT seeds use `ON CONFLICT DO NOTHING` — safe to re-run

---

## RISK AREA 2: studio_slots Date-Awareness

**Verdict: ✅ SAFE (with notes)**

| Check | Result |
|-------|--------|
| `slot_date` nullable? | Yes — `ADD COLUMN IF NOT EXISTS slot_date DATE` (no NOT NULL) |
| Backfill safe? | Yes — `WHERE slot_date IS NULL` only |
| CHECK constraint on `status`? | Safe — `DEFAULT 'tentative'` populates new column on ADD |
| CHECK constraint on `source`? | Safe — `DEFAULT 'manual'` populates new column on ADD |
| Legacy queries break? | No — old queries on `week_key`/`day_of_week`/`assignee` still work |
| seed route backfills? | Yes — fills `slot_date` for existing weeks with NULL dates |

**Note**: The backfill PL/pgSQL function (`lobster_backfill_slot_dates`) uses ISO week math. The day_of_week mapping assumes 0=Monday..6=Sunday, which matches the existing `generateWeekSlotDefinitions` in `week-utils.ts`. Verified consistent.

---

## RISK AREA 3: Ledger Consistency

**Verdict: ✅ SAFE (with fixes applied)**

| Check | Result |
|-------|--------|
| UNIQUE constraint on slot_id? | Yes — `UNIQUE(slot_id)` on `lobster_fairness_ledger` |
| Upserts use onConflict? | Yes — all write paths use `{ onConflict: 'slot_id' }` |
| Idempotent re-assignment? | Yes — same slot re-assigned overwrites same ledger row |
| Unassign cleans ledger? | Yes — POST /api/slots deletes from ledger on null assignee |
| ON DELETE CASCADE? | Yes — `slot_id UUID NOT NULL REFERENCES studio_slots(id) ON DELETE CASCADE` |

### Finding fixed: PUT /api/slots (custom slot creation) was NOT writing to ledger
**Severity**: Medium — custom slots would be invisible to fairness accounting.
**Fix applied**: Added ledger upsert after successful insert in PUT handler.

### Known V1 limitation: Ledger is write-only
The fairness HUD and summary API compute LIVE from `studio_slots` joins, not from the ledger. This is intentionally the safer V1 approach (no drift risk between ledger and slots). The ledger serves as an audit trail for future use (e.g., historical replay, period snapshots).

---

## RISK AREA 4: Swap Flow Completeness

**Verdict: ✅ SAFE (with fix applied)**

Flow: validate → apply slot → update ledger → update swap status

| Step | Route | Status |
|------|-------|--------|
| Validate move | `swaps/[id]/decide` L60 | ✅ Uses `validateMove()` |
| Apply to slot | `swaps/[id]/decide` L79-88 | ✅ Updates assignee + person + entity |
| Write ledger | `swaps/[id]/decide` L100-117 | ✅ Upserts with onConflict |
| Update swap status | `swaps/[id]/decide` L122-130 | ✅ Sets status + responded_at |
| Guard pending-only | `swaps/[id]/decide` L40-42 | ✅ Rejects if not 'pending' |

**Entity resolution in swap**: Line 74 maps `swap.requester` (legacy enum: 'roman'/'lobster') to entity slug. This is correct for legacy data. For new person-level swaps, `requester_person_id` is checked first (L67-72).

### Finding fixed: validateAssignment() was imported but never called
**Severity**: High — the 8 new safeguard rules (room overlap, person overlap, consecutive nights per person, rest time, daily hours, duration limits, locked slots) were dead code.
**Fix applied**: POST /api/slots now runs `validateAssignment()` when a person slug + slot_date are present. Blocks are returned as 422; warnings are merged into the response alongside legacy validation.

---

## RISK AREA 5: Summary Computation / Drift

**Verdict: ✅ NO DRIFT (by design)**

| Source | Reads from | Writes to |
|--------|-----------|-----------|
| Fairness HUD | `studio_slots` (live join) | — |
| `/api/fairness` | `studio_slots` (live join) | — |
| `/api/fairness/summary` | `studio_slots` (live join) | — |
| POST /api/slots | — | `lobster_fairness_ledger` |
| PUT /api/slots | — | `lobster_fairness_ledger` |
| Swap decide | — | `lobster_fairness_ledger` |

**All reads are live computations from the source-of-truth (`studio_slots`)**. No stored summary is ever read. This eliminates drift by construction.

### Known V1 dead code: `lobster_fairness_summary` table
Created in migration but never written to or read from. Harmless — exists for V2 when we may want materialized period snapshots. No action needed; the table sits empty.

---

## RISK AREA 6: RLS Policies

**Verdict: ⚠️ ACCEPTABLE for V1 (service role bypasses RLS)**

All API routes use `createServiceClient()` which instantiates with the Supabase service role key. **Service role bypasses RLS entirely**, so the permissive policies have zero runtime effect.

However, for defense-in-depth, these policies are too broad:

```sql
-- These allow ANY role (including anon) to write:
CREATE POLICY "Service can manage fairness" ON lobster_fairness_ledger FOR ALL USING (true);
CREATE POLICY "Service can manage summary" ON lobster_fairness_summary FOR ALL USING (true);
```

**Recommendation for V2**: Replace `USING (true)` with `USING (auth.role() = 'service_role')` once you enable direct client access. For V1 with service-role-only access, this is non-exploitable.

---

## ADDITIONAL FINDINGS

### 1. `computeSlotMinutes` overnight handling
The function handles `20:00→02:00` correctly (360 min). But if both times are equal (e.g., `10:00→10:00`), it returns 24*60 = 1440 min (full day). Edge case — unlikely in practice since we validate `minutes < 30` for custom slots. Acceptable for V1.

### 2. `detectWeekend` date parsing
Uses `new Date(slot.slot_date)` which parses as UTC. A date like `2026-03-07` (Saturday) creates `Sat Mar 07 2026 00:00:00 UTC`, `getDay()` returns 6 (Saturday). Correct. No timezone trap here because we only use the date part.

### 3. CSV export — no escaping
The CSV summary export joins values with `,` but doesn't quote fields. Entity names like "R.L" are safe. Person names like "Léonard" with accents are safe (no commas). If future entity names contain commas, this would break. Low risk for V1.

---

## FIXES APPLIED

| # | Finding | Severity | Fix |
|---|---------|----------|-----|
| 1 | PUT /api/slots missing ledger write | Medium | Added upsert after insert |
| 2 | `validateAssignment()` never called | High | Wired into POST /api/slots with block/warn handling |

## KNOWN V1 LIMITATIONS (accepted)

| # | Item | Risk | Decision |
|---|------|------|----------|
| 1 | Ledger is write-only (never read for HUD) | None | Safer — live computation eliminates drift |
| 2 | `lobster_fairness_summary` table empty | None | Reserved for V2 materialized views |
| 3 | RLS policies overly permissive | None (service role) | Tighten in V2 if client-side access added |
| 4 | CSV export unquoted | Low | Entity/person names have no commas |
