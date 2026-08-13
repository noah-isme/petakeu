# R4 Staging Release Verification Runbook

This runbook is the release gate for the remaining R4 item: applying
`007_staged_ingestion.sql` and `008_report_filters.sql` in staging, proving the
PostgreSQL/Redis/MinIO/BullMQ path, exercising RBAC and performance contracts,
and recording backup, restore, and rollback evidence.

It is written for an already provisioned staging environment. The checked-in
server starts migrations before the HTTP listener, initializes object-storage
buckets, starts the upload and report BullMQ workers, and then serves
`/healthz`, `/ready`, `/live`, and `/metrics`. Do not copy production data into
a test fixture or run these commands against production.

## Release gate and safety rules

The release owner must have:

- a release image/tag or commit SHA and the previous known-good API/web image;
- staging access to PostgreSQL 16 + PostGIS 3.4, Redis 7, MinIO/S3, the API,
  and the web application;
- short-lived JWTs for `public`, `viewer`, `operator`, and `admin` roles;
- a disposable `.xlsx` fixture containing at least one valid row and one row
  with a non-blocking warning, plus a second fixture with a unique source for
  the cancellation check;
- an evidence directory and named approvers for deploy, restore, and go/no-go.

Do not enable `AUTH_DISABLED=true`, print secrets, run `redis-cli FLUSH*`,
delete buckets, prune images, or overwrite the staging database before the
backup and restore evidence has been captured. The preflight script at
`scripts/verify-r4-staging.mjs` is read-only against staging: it reads migration
files and performs HTTP `GET` probes only. When `--evidence-dir` is supplied it
writes only a local, redacted preflight artifact. It does not replace the live
suites or the manual upload confirmation test.

## 1. Set release variables

Use an API origin without `/api` for `STAGING_API_URL`. Keep the API and web
origins separate because the live security contracts call the API directly.

```bash
set -euo pipefail

export RELEASE_ID="r4-$(date -u +%Y%m%d-%H%M%S)"
export STAGING_API_URL="https://api.staging.example"
export STAGING_WEB_URL="https://staging.example"
export STAGING_HOST="staging.example"
export STAGING_SSH_USER="deploy"
export STAGING_COMPOSE_DIR="/opt/petakeu"

# Runtime configuration. Load these from the staging secret manager or shell;
# never commit a populated file or echo it with shell tracing enabled.
export NODE_ENV=production
export DATABASE_URL="${STAGING_DATABASE_URL:?set a staging-only DATABASE_URL}"
export REDIS_URL="${STAGING_REDIS_URL:?set a staging-only REDIS_URL}"
export STORAGE_ENDPOINT="${STAGING_STORAGE_ENDPOINT:?set a staging storage endpoint}"
export STORAGE_ACCESS_KEY="${STAGING_STORAGE_ACCESS_KEY:?set staging storage credentials}"
export STORAGE_SECRET_KEY="${STAGING_STORAGE_SECRET_KEY:?set staging storage credentials}"
export STORAGE_BUCKET="${STAGING_STORAGE_BUCKET:-uploads}"
export STORAGE_REPORTS_BUCKET="${STAGING_STORAGE_REPORTS_BUCKET:-reports}"
export AUTH_SECRET="${STAGING_AUTH_SECRET:?set the staging JWT secret}"
export AUTH_DISABLED=false

# Start with the legacy path for baseline compatibility checks. Flip to true
# only after the baseline and backup gates pass.
export UPLOAD_REQUIRE_CONFIRMATION=false

# Live backend and Playwright security contracts.
export PETAKEU_INTEGRATION=1
export PETAKEU_RUN_LIVE_E2E=1
export PETAKEU_E2E_API_BASE_URL="${STAGING_API_URL}/api"
export PETAKEU_E2E_PERIOD="${PETAKEU_E2E_PERIOD:-2026-08}"
export PETAKEU_PUBLIC_TOKEN="${STAGING_PUBLIC_TOKEN:?set a short-lived public JWT}"
export PETAKEU_VIEWER_TOKEN="${STAGING_VIEWER_TOKEN:?set a short-lived viewer JWT}"
export PETAKEU_OPERATOR_TOKEN="${STAGING_OPERATOR_TOKEN:?set a short-lived operator JWT}"
export PETAKEU_ADMIN_TOKEN="${STAGING_ADMIN_TOKEN:?set a short-lived admin JWT}"

# Approved staging-only .xlsx fixtures. Keep each source/hash unique so the
# upload deduplication contract does not reuse a prior release's upload.
export R4_CONFIRMATION_FIXTURE="${R4_CONFIRMATION_FIXTURE:?set path to valid+warning .xlsx fixture}"
export R4_CANCEL_FIXTURE="${R4_CANCEL_FIXTURE:?set path to unique cancellation .xlsx fixture}"

# Optional direct MinIO liveness endpoint. Omit this for managed S3; /healthz
# still proves the configured storage client and buckets.
export R4_STORAGE_HEALTH_URL="${R4_STORAGE_HEALTH_URL:-}"
export EVIDENCE_DIR="${EVIDENCE_DIR:-$PWD/.r4-evidence/$RELEASE_ID}"
umask 077
mkdir -p "$EVIDENCE_DIR"
date -u +%FT%TZ > "$EVIDENCE_DIR/start-time.txt"
```

The preflight requires `AUTH_SECRET` to be at least 32 characters, all four
role tokens, and an explicit `UPLOAD_REQUIRE_CONFIRMATION` value for the
selected phase. It reports only whether secret values are present, never their
contents.

```bash
R4_API_URL="$STAGING_API_URL" \
  node scripts/verify-r4-staging.mjs --phase baseline --evidence-dir "$EVIDENCE_DIR" --json \
  | tee "$EVIDENCE_DIR/preflight-baseline-command.json"
```

Do not continue when this command exits non-zero. A missing
`UPLOAD_REQUIRE_CONFIRMATION` is not equivalent to an explicit `false` or
`true` setting.

The preflight writes its own mode-0600 JSON artifact in `EVIDENCE_DIR`; the
`tee` copy is retained as the operator's command log. `--skip-http` is for
local diagnostics only and is a failed release gate unless paired with the
explicit `--allow-skipped` flag.

### Deterministic live-suite gate

The integration and security contracts intentionally skip when staging
dependencies or role tokens are unavailable during ordinary local runs. For a
release, run them through the strict wrapper below. It requires the live
environment, creates mode-0700 evidence storage, redacts child output, and
fails when a suite exits non-zero, produces no structured report, executes no
tests, or reports any skipped test:

```bash
node scripts/run-r4-live-suite.mjs \
  --suite integration \
  --evidence-dir "$EVIDENCE_DIR" \
  --period "$PETAKEU_E2E_PERIOD" \
  --json \
  | tee "$EVIDENCE_DIR/live-suite-integration.json"

node scripts/run-r4-live-suite.mjs \
  --suite security \
  --api-url "$STAGING_API_URL" \
  --evidence-dir "$EVIDENCE_DIR" \
  --period "$PETAKEU_E2E_PERIOD" \
  --json \
  | tee "$EVIDENCE_DIR/live-suite-security.json"
```

The wrapper's `DRY_RUN` mode validates configuration and records the commands,
but is never a release pass. Run deterministic wrapper checks without staging
credentials with:

```bash
node --test scripts/r4-release-gate.test.mjs
```

### Deployment configuration caveat

`docker-compose.prod.yml` maps `UPLOAD_REQUIRE_CONFIRMATION`,
`STORAGE_REPORTS_BUCKET`, and `AUTH_DISABLED` from the deployment environment
into the API service. The staging deployment layer must still provide
non-empty, staging-only values through its secret manager or orchestrator
configuration before this runbook can pass. Verify inside the running API
container, not only in the operator shell:

```bash
ssh "$STAGING_SSH_USER@$STAGING_HOST" \
  "cd '$STAGING_COMPOSE_DIR' && docker compose -f docker-compose.prod.yml exec -T api sh -lc \
   'printf \"NODE_ENV=%s\\nAUTH_DISABLED=%s\\nUPLOAD_REQUIRE_CONFIRMATION=%s\\nSTORAGE_BUCKET=%s\\nSTORAGE_REPORTS_BUCKET=%s\\n\" \"\$NODE_ENV\" \"\$AUTH_DISABLED\" \"\$UPLOAD_REQUIRE_CONFIRMATION\" \"\$STORAGE_BUCKET\" \"\$STORAGE_REPORTS_BUCKET\"'" \
  | tee "$EVIDENCE_DIR/container-env-baseline.txt"
```

Expected output is `NODE_ENV=production`, `AUTH_DISABLED=false`,
`UPLOAD_REQUIRE_CONFIRMATION=false`, and two non-empty bucket names. If the
deployment system cannot inject the values, stop and open a deployment
configuration change; do not enable auth bypass or edit a live container
manually.

## 2. Capture backup and release evidence before deployment

Record the candidate and current image identifiers without printing secret
environment variables:

```bash
git rev-parse HEAD | tee "$EVIDENCE_DIR/source-sha.txt"
ssh "$STAGING_SSH_USER@$STAGING_HOST" \
  "cd '$STAGING_COMPOSE_DIR' && docker compose -f docker-compose.prod.yml ps && docker compose -f docker-compose.prod.yml images" \
  | tee "$EVIDENCE_DIR/services-before.txt"
```

### PostgreSQL backup

Use the provider's snapshot/PITR operation when PostgreSQL is managed and save
the provider snapshot ID. For an accessible staging database, a custom-format
dump is suitable for an isolated restore test:

```bash
export BACKUP_FILE="$EVIDENCE_DIR/postgres-$RELEASE_ID.dump"
pg_dump --format=custom --no-owner --file="$BACKUP_FILE" "$DATABASE_URL"
pg_restore --list "$BACKUP_FILE" > "$EVIDENCE_DIR/postgres-$RELEASE_ID.contents.txt"
sha256sum "$BACKUP_FILE" | tee "$EVIDENCE_DIR/postgres-$RELEASE_ID.sha256"
```

Record snapshot ID, dump checksum, database host/name (never the password),
start/end times, and operator. The backup is a hard gate: no migration or
feature-flag change is approved without it.

### Object storage and Redis evidence

Use provider-native versioning/replication or a snapshot for MinIO/S3 and
record its immutable ID. The following commands are read-only inventory checks
and do not prove a restore by themselves:

```bash
# MinIO-compatible endpoint; mc must already be configured for staging.
export STAGING_MC_ALIAS="${STAGING_MC_ALIAS:-petakeu-staging}"
mc alias set "$STAGING_MC_ALIAS" "$STORAGE_ENDPOINT" \
  "$STORAGE_ACCESS_KEY" "$STORAGE_SECRET_KEY" \
  | tee "$EVIDENCE_DIR/mc-alias.txt"
mc ls "$STAGING_MC_ALIAS/$STORAGE_BUCKET" \
  | tee "$EVIDENCE_DIR/storage-uploads-before.txt"
mc ls "$STAGING_MC_ALIAS/$STORAGE_REPORTS_BUCKET" \
  | tee "$EVIDENCE_DIR/storage-reports-before.txt"

redis-cli -u "$REDIS_URL" PING \
  | tee "$EVIDENCE_DIR/redis-ping-before.txt"
redis-cli -u "$REDIS_URL" INFO persistence \
  | tee "$EVIDENCE_DIR/redis-persistence-before.txt"
redis-cli -u "$REDIS_URL" --scan --pattern 'bull:*' \
  | head -200 | tee "$EVIDENCE_DIR/bullmq-keys-before.txt"
```

If a managed service does not permit these commands, attach its backup
verification report instead. A cache snapshot is not a substitute for the
PostgreSQL or object-storage backup.

## 3. Deploy the candidate with confirmation disabled

Use the existing staging pipeline where possible:

```bash
gh workflow run deploy-staging.yml -f environment=staging
```

If the deployment owner uses SSH/Compose, the equivalent staging-only action
is:

```bash
ssh "$STAGING_SSH_USER@$STAGING_HOST" \
  "cd '$STAGING_COMPOSE_DIR' && \
   docker compose -f docker-compose.prod.yml pull && \
   docker compose -f docker-compose.prod.yml up -d --remove-orphans"
```

Do not run `docker image prune` during this release; retain both candidate and
previous images until rollback evidence is complete. The API startup runner
applies every unapplied file in numeric order and records it in `_migrations`.
Do not manually apply 007 or 008 first, because that bypasses the runner's
transaction and evidence.

Capture migration and startup logs:

```bash
ssh "$STAGING_SSH_USER@$STAGING_HOST" \
  "cd '$STAGING_COMPOSE_DIR' && docker compose -f docker-compose.prod.yml logs --since 15m api" \
  | tee "$EVIDENCE_DIR/api-startup-baseline.log"
```

Look for `[migrate] Applying:` and `[migrate] Applied:` lines for both target
files. On a restart, expected evidence is `Skipping already-applied` for both.
A migration error stops the API; preserve the log and move to rollback/restore.

## 4. Verify migrations and schema from PostgreSQL

The migration runner is the source of truth. Confirm both files were recorded
and inspect the additive schema:

```bash
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' \
  | tee "$EVIDENCE_DIR/migrations-baseline.txt"
SELECT name, applied_at
  FROM _migrations
 WHERE name IN ('007_staged_ingestion.sql', '008_report_filters.sql')
 ORDER BY name;

SELECT to_regclass('public.staged_upload_rows') AS staged_upload_rows,
       to_regclass('public.upload_validation_findings') AS upload_validation_findings,
       to_regclass('public.upload_rows') AS upload_rows_view,
       to_regclass('public.region_aliases') AS region_aliases;

SELECT column_name
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'report_jobs'
   AND column_name IN ('period_from', 'period_to', 'province_ids',
                       'ranking_criterion', 'amount_basis', 'report_type')
 ORDER BY column_name;

SELECT conname
  FROM pg_constraint
 WHERE conname IN ('uploads_status_check_007',
                   'report_jobs_ranking_criterion_008',
                   'report_jobs_amount_basis_008',
                   'report_jobs_report_type_008')
 ORDER BY conname;

SELECT COUNT(*) AS regions,
       (SELECT COUNT(*) FROM payments) AS payments,
       (SELECT COUNT(*) FROM uploads) AS uploads,
       (SELECT COUNT(*) FROM report_jobs) AS report_jobs
  FROM regions;

SELECT PostGIS_Version() AS postgis_version;
SQL
```

The result must include one `_migrations` row for each target file, all target
relations/columns/constraints, a usable PostGIS version, and non-erroring
counts. Existing rows and legacy `payments.amount` remain available; 007 is
additive and does not authorize deleting old columns.

Restart the API once after this check and repeat the `_migrations` query. The
second startup must skip, rather than reapply, 007 and 008.

## 5. Health, readiness, Redis, BullMQ, and MinIO

Run the read-only preflight against the deployed API and save evidence:

```bash
R4_API_URL="$STAGING_API_URL" \
  node scripts/verify-r4-staging.mjs --phase baseline --evidence-dir "$EVIDENCE_DIR" --json \
  | tee "$EVIDENCE_DIR/preflight-baseline-after-deploy-command.json"

for endpoint in live ready healthz metrics; do
  curl --fail-with-body --silent --show-error \
    "$STAGING_API_URL/$endpoint" \
    | tee "$EVIDENCE_DIR/http-$endpoint-baseline.json"
  printf '\n' >> "$EVIDENCE_DIR/http-$endpoint-baseline.json"
done
```

The release gate requires `/live` 200 with `alive: true`, `/ready` 200 with
`ready: true`, `/healthz` 200 with `status: healthy`, and `/metrics` 200 with
Petakeu metrics. Health components `database`, `redis`, `storage`, and `queue`
must all be `healthy`; a degraded queue or storage is not a release pass. If
`R4_STORAGE_HEALTH_URL` is set, the MinIO liveness endpoint must return 200.

The API health implementation checks Postgres/PostGIS, Redis `PING`, both
storage buckets, and BullMQ upload/report queue counters. Corroborate queue
processes and bucket initialization in logs:

```bash
ssh "$STAGING_SSH_USER@$STAGING_HOST" \
  "cd '$STAGING_COMPOSE_DIR' && docker compose -f docker-compose.prod.yml logs --since 15m api" \
  | rg -i 'storage|bucket|upload-worker|report-worker|BullMQ|queue|error|fatal' \
  | tee "$EVIDENCE_DIR/workers-storage-baseline.log"
```

For MinIO, `mc ls` must show both configured buckets and the health payload must
identify the same names. For Redis, `PING` must be `PONG`, persistence or
managed snapshot status must be recorded, and both BullMQ queues must be
visible in the health payload after they have been used.

## 6. Baseline live suites (`UPLOAD_REQUIRE_CONFIRMATION=false`)

Run static checks on the candidate before live tests:

```bash
pnpm lint | tee "$EVIDENCE_DIR/pnpm-lint.txt"
pnpm typecheck | tee "$EVIDENCE_DIR/pnpm-typecheck.txt"
pnpm test | tee "$EVIDENCE_DIR/pnpm-test.txt"
pnpm build | tee "$EVIDENCE_DIR/pnpm-build.txt"
```

The integration tests are opt-in and use real PostgreSQL, Redis, MinIO, and
BullMQ. They clean up uniquely generated test rows/objects after each run;
execute them only against isolated staging and preserve the logs. Run the
strict wrapper so an infrastructure skip cannot be mistaken for a pass:

```bash
node scripts/run-r4-live-suite.mjs \
  --suite integration \
  --evidence-dir "$EVIDENCE_DIR" \
  --period "$PETAKEU_E2E_PERIOD" \
  --json \
  | tee "$EVIDENCE_DIR/live-suite-integration-baseline.json"
```

The upload contract proves queued → processed/persisted, payment materialization,
materialized-view refresh, and cache invalidation. The report contract proves
BullMQ execution, MinIO persistence, workbook output, and presigned URL expiry.

Run live RBAC/redaction and report-expiry contracts with all four role tokens
through the same strict wrapper:

```bash
node scripts/run-r4-live-suite.mjs \
  --suite security \
  --api-url "$STAGING_API_URL" \
  --evidence-dir "$EVIDENCE_DIR" \
  --period "$PETAKEU_E2E_PERIOD" \
  --json \
  | tee "$EVIDENCE_DIR/live-suite-security-baseline.json"
```

The wrapper stores child stdout/stderr and structured JSON reports under the
evidence directory. A skipped test is not a production readiness result. If a
test skips because a token, API URL, or dependency is unavailable, fix staging
setup and rerun; do not count the skip as pass.

The browser journey suite (`release-hardening.spec.ts`) verifies the mounted
map, legend, region detail, and upload-template controls. The checked-in
Playwright config uses local `http://localhost:5175`, so use the deployment
team's temporary/CI Playwright config to point page tests at `STAGING_WEB_URL`;
do not commit a credentials-bearing config. The direct API security suite above
is the authoritative staging RBAC contract.

## 7. Performance gate

Warm and cold choropleth requests must meet the existing targets: cache-hit
p95 < 300 ms, cold p95 < 2 s, and no failed requests. Use the repository's
benchmark so its JSON includes both scenario results:

```bash
pnpm benchmark -- \
  --url="$STAGING_API_URL" \
  --period="$PETAKEU_E2E_PERIOD" \
  --token="$PETAKEU_OPERATOR_TOKEN" \
  --concurrency=10 \
  --requests=50 \
  --hit-sla=300 \
  --cold-sla=2000 \
  --json \
  | tee "$EVIDENCE_DIR/choropleth-benchmark-baseline.json"
```

For a longer 10 requests/second arrival-rate measurement, use the k6 wrapper
or its dependency-free Node fallback:

```bash
BASE_URL="$STAGING_API_URL" \
BEARER_TOKEN="$PETAKEU_OPERATOR_TOKEN" \
RPS=10 DURATION_SECONDS=30 \
  node scripts/run-choropleth-load.mjs \
  | tee "$EVIDENCE_DIR/choropleth-load-baseline.json"
```

Record candidate image, warm/cold period parameters, request count, p50, p95,
p99, error count, and database/Redis utilization. Any threshold failure or
elevated 5xx rate is a no-go until investigated and rerun.

## 8. Enable and verify staged confirmation

Only after Sections 2–7 pass, change the API runtime configuration to
`UPLOAD_REQUIRE_CONFIRMATION=true` through the staging secret/configuration
system. Restart the API using the normal deployment mechanism; do not mutate a
running container with a one-off `docker exec export`.

```bash
export UPLOAD_REQUIRE_CONFIRMATION=true

# Apply through the same staging deployment path used in Section 3, then check:
ssh "$STAGING_SSH_USER@$STAGING_HOST" \
  "cd '$STAGING_COMPOSE_DIR' && docker compose -f docker-compose.prod.yml exec -T api sh -lc \
   'test \"\$UPLOAD_REQUIRE_CONFIRMATION\" = true && echo UPLOAD_REQUIRE_CONFIRMATION=true'" \
  | tee "$EVIDENCE_DIR/container-env-confirmation.txt"

R4_API_URL="$STAGING_API_URL" \
  node scripts/verify-r4-staging.mjs --phase confirmation --evidence-dir "$EVIDENCE_DIR" --json \
  | tee "$EVIDENCE_DIR/preflight-confirmation-command.json"
```

Use approved `.xlsx` fixtures. The first fixture must contain a valid row and a
warning; the second must have a unique source so cancellation cannot collide
with the first upload.

### 8.1 Upload → parse → review

```bash
export OPERATOR_AUTH="Authorization: Bearer $PETAKEU_OPERATOR_TOKEN"
export UPLOAD_RESPONSE="$EVIDENCE_DIR/upload-confirmation-response.json"

curl --fail-with-body --silent --show-error \
  -X POST "$STAGING_API_URL/api/uploads" \
  -H "$OPERATOR_AUTH" \
  -F "file=@$R4_CONFIRMATION_FIXTURE" \
  | tee "$UPLOAD_RESPONSE"
export UPLOAD_ID="$(jq -r '.uploadId' "$UPLOAD_RESPONSE")"
test -n "$UPLOAD_ID" && test "$UPLOAD_ID" != null

for attempt in $(seq 1 30); do
  curl --fail-with-body --silent --show-error \
    "$STAGING_API_URL/api/uploads/$UPLOAD_ID" \
    -H "$OPERATOR_AUTH" \
    | tee "$EVIDENCE_DIR/upload-$UPLOAD_ID-$attempt.json"
  status="$(jq -r '.data.status' "$EVIDENCE_DIR/upload-$UPLOAD_ID-$attempt.json")"
  case "$status" in
    awaiting_confirmation|parsed|failed) break ;;
    *) sleep 2 ;;
  esac
done

curl --fail-with-body --silent --show-error \
  "$STAGING_API_URL/api/uploads/$UPLOAD_ID/rows?page=1&pageSize=200" \
  -H "$OPERATOR_AUTH" \
  | tee "$EVIDENCE_DIR/upload-$UPLOAD_ID-rows-before-edit.json"
```

Expected behavior is `awaiting_confirmation` (or `parsed` for a fixture with no
warnings), staged rows present, immutable findings present, and no new
`payments` row for the fixture yet. A blocking error must keep the upload out
of confirmation until the row is corrected.

### 8.2 Correct a row and verify revision protection

Take the row ID and current `revision` from the rows response. Submit only the
fields that need correction and retain the revision in the request:

```bash
export ROW_ID="$(jq -r '.data[0].id' "$EVIDENCE_DIR/upload-$UPLOAD_ID-rows-before-edit.json")"
export ROW_REVISION="$(jq -r '.data[0].revision' "$EVIDENCE_DIR/upload-$UPLOAD_ID-rows-before-edit.json")"

curl --fail-with-body --silent --show-error \
  -X PATCH "$STAGING_API_URL/api/uploads/$UPLOAD_ID/rows/$ROW_ID" \
  -H "$OPERATOR_AUTH" -H 'Content-Type: application/json' \
  -d "{\"revision\":$ROW_REVISION,\"source\":\"r4-$RELEASE_ID\"}" \
  | tee "$EVIDENCE_DIR/upload-$UPLOAD_ID-row-correction.json"

# Replaying the old revision must return HTTP 409 and must not overwrite the
# newer row. Capture the response without making curl fail on the expected 409.
curl --silent --show-error -o "$EVIDENCE_DIR/upload-$UPLOAD_ID-stale-revision.json" \
  -w '%{http_code}\n' \
  -X PATCH "$STAGING_API_URL/api/uploads/$UPLOAD_ID/rows/$ROW_ID" \
  -H "$OPERATOR_AUTH" -H 'Content-Type: application/json' \
  -d "{\"revision\":$ROW_REVISION,\"source\":\"stale-r4-$RELEASE_ID\"}" \
  | tee "$EVIDENCE_DIR/upload-$UPLOAD_ID-stale-revision.status"
test "$(cat "$EVIDENCE_DIR/upload-$UPLOAD_ID-stale-revision.status")" = 409
```

Record the new revision and validation findings after correction. Do not
continue if the stale revision succeeds or immutable findings can be
updated/deleted through any API path.

### 8.3 Acknowledge warnings, confirm, and verify persistence

First prove that confirmation without acknowledgement is rejected. Then
acknowledge the warning IDs shown in the current rows response (or use the
explicit all-warning acknowledgement only when the fixture and approval call
for it):

```bash
curl --silent --show-error -o "$EVIDENCE_DIR/upload-$UPLOAD_ID-confirm-without-ack.json" \
  -w '%{http_code}\n' \
  -X POST "$STAGING_API_URL/api/uploads/$UPLOAD_ID/confirm" \
  -H "$OPERATOR_AUTH" -H 'Content-Type: application/json' -d '{}' \
  | tee "$EVIDENCE_DIR/upload-$UPLOAD_ID-confirm-without-ack.status"
test "$(cat "$EVIDENCE_DIR/upload-$UPLOAD_ID-confirm-without-ack.status")" = 409

curl --fail-with-body --silent --show-error \
  -X POST "$STAGING_API_URL/api/uploads/$UPLOAD_ID/confirm" \
  -H "$OPERATOR_AUTH" -H 'Content-Type: application/json' \
  -d '{"acknowledgeWarnings":true}' \
  | tee "$EVIDENCE_DIR/upload-$UPLOAD_ID-confirmed.json"

curl --fail-with-body --silent --show-error \
  "$STAGING_API_URL/api/uploads/$UPLOAD_ID" \
  -H "$OPERATOR_AUTH" \
  | tee "$EVIDENCE_DIR/upload-$UPLOAD_ID-after-confirm.json"
```

The terminal state must be `persisted`, `confirmed_by`/`confirmed_at` and
`committed_at` must be populated, and expected payment/source values must
appear only after confirmation. Verify the view and cache invalidation with
read-only SQL/Redis queries and capture post-confirm health:

```bash
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c \
  "SELECT id, status, confirmed_by, confirmed_at, committed_at, valid_row_count, warning_count FROM uploads WHERE id = '$UPLOAD_ID';" \
  | tee "$EVIDENCE_DIR/upload-$UPLOAD_ID-db-after-confirm.txt"

curl --fail-with-body --silent --show-error \
  "$STAGING_API_URL/healthz" \
  | tee "$EVIDENCE_DIR/health-after-confirm.json"
```

### 8.4 Cancel path

Upload the second unique fixture, wait for `awaiting_confirmation`, then cancel
it as the operator:

```bash
export UPLOAD_RESPONSE_2="$EVIDENCE_DIR/upload-cancel-response.json"
curl --fail-with-body --silent --show-error \
  -X POST "$STAGING_API_URL/api/uploads" \
  -H "$OPERATOR_AUTH" \
  -F "file=@$R4_CANCEL_FIXTURE" \
  | tee "$UPLOAD_RESPONSE_2"
export UPLOAD_ID_2="$(jq -r '.uploadId' "$UPLOAD_RESPONSE_2")"
test -n "$UPLOAD_ID_2" && test "$UPLOAD_ID_2" != null

for attempt in $(seq 1 30); do
  curl --fail-with-body --silent --show-error \
    "$STAGING_API_URL/api/uploads/$UPLOAD_ID_2" \
    -H "$OPERATOR_AUTH" \
    | tee "$EVIDENCE_DIR/upload-$UPLOAD_ID_2-$attempt.json"
  status="$(jq -r '.data.status' "$EVIDENCE_DIR/upload-$UPLOAD_ID_2-$attempt.json")"
  case "$status" in
    awaiting_confirmation|parsed|failed) break ;;
    *) sleep 2 ;;
  esac
done

curl --fail-with-body --silent --show-error \
  -X POST "$STAGING_API_URL/api/uploads/$UPLOAD_ID_2/cancel" \
  -H "$OPERATOR_AUTH" \
  | tee "$EVIDENCE_DIR/upload-$UPLOAD_ID_2-cancelled.json"
```

The upload must become `cancelled`; no payment should be written for its unique
source; a later confirm must return 409. Preserve the upload response and the
read-only SQL query proving no payment was committed.

Refresh the first-party web page after each transition and verify that staged
upload, row revision, warning acknowledgement, confirmation, and cancellation
states survive a browser refresh. Capture a Playwright trace or manual
evidence in the same release directory.

## 9. Verify persisted report filters (008)

Select a seeded region ID and an unlocked period from staging. Submit a report
using a range, province filter, ranking criterion, amount basis, and report
type; then inspect both the API response and `report_jobs` row:

```bash
export REGION_ID="$(psql "$DATABASE_URL" -XAtc \
  "SELECT id::text FROM regions WHERE level=2 ORDER BY code_bps LIMIT 1")"
export PERIOD_FROM="${PERIOD_FROM:-2026-01}"
export PERIOD_TO="${PERIOD_TO:-2026-08}"

curl --fail-with-body --silent --show-error \
  -X POST "$STAGING_API_URL/api/reports/export" \
  -H "Authorization: Bearer $PETAKEU_VIEWER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"periodFrom\":\"$PERIOD_FROM\",\"periodTo\":\"$PERIOD_TO\",\"regionIds\":[\"$REGION_ID\"],\"format\":\"excel\",\"rankingCriterion\":\"growth\",\"amountBasis\":\"net\",\"reportType\":\"full\"}" \
  | tee "$EVIDENCE_DIR/report-filtered-response.json"
export REPORT_JOB_ID="$(jq -r '.data.jobId' "$EVIDENCE_DIR/report-filtered-response.json")"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c \
  "SELECT id, period_from, period_to, province_ids, ranking_criterion, amount_basis, report_type, status FROM report_jobs WHERE id = '$REPORT_JOB_ID';" \
  | tee "$EVIDENCE_DIR/report-$REPORT_JOB_ID-db.txt"
```

Poll `GET /api/reports/$REPORT_JOB_ID` until `completed` and verify the
download URL is non-empty, the object exists in the reports bucket, and expiry
is no more than 24 hours. A failed worker, missing filter columns, or a report
that loses filters after restart is a no-go.

## 10. Rollback and restore evidence

### Application-only rollback

If the candidate image fails health, browser, security, or performance checks
but the schema is intact, retain 007/008 and roll back only the API/web image
to the recorded known-good digest. Use the deployment platform's immutable
image/tag operation; do not rebuild from an unpinned branch. For Compose, the
release owner should update the staging image reference to the recorded
previous tag/digest and run:

```bash
ssh "$STAGING_SSH_USER@$STAGING_HOST" \
  "cd '$STAGING_COMPOSE_DIR' && \
   docker compose -f docker-compose.prod.yml up -d --no-deps api web"
```

Capture image digest, startup log, `/ready` response, and the reason for
rollback. Because 007/008 are additive, the previous application should remain
able to start with the new schema; verify its core map/report read paths before
declaring recovery.

### Isolated PostgreSQL restore drill

The backup is not proven until it has been restored into an isolated database
or the managed provider has produced a successful restore/PITR report. Prefer a
new staging verification database that cannot receive user traffic:

```bash
export RESTORE_DATABASE="petakeu_r4_restore_$RANDOM"
createdb "$RESTORE_DATABASE"
pg_restore --no-owner --dbname="$RESTORE_DATABASE" "$BACKUP_FILE"

psql "${DATABASE_URL%/*}/$RESTORE_DATABASE" -X -v ON_ERROR_STOP=1 -c \
  "SELECT COUNT(*) AS regions FROM regions; SELECT COUNT(*) AS payments FROM payments; SELECT PostGIS_Version();" \
  | tee "$EVIDENCE_DIR/postgres-restore-check.txt"
```

Record restored database name, dump checksum, restore duration, table counts,
PostGIS version, and operator. Keep the isolated restore available until the
go/no-go decision; remove it only through the approved staging cleanup process
after evidence is archived. Never point the web/API at this database during
the drill.

For MinIO/S3, restore the release's object snapshot/replica into an isolated
bucket or use the provider's restore verification report. Prove at least one
upload object and one report object with `mc stat`/`aws s3api head-object`; do
not use the live bucket as the restore target. Record snapshot ID, target
bucket, object keys, checksums/ETags, and restore result.

### Database rollback decision

Only restore the staging primary when an approved migration failure or data
corruption requires it. The operation is destructive to staging writes and
requires the DBA and release owner to confirm the exact backup target. Stop
API/worker writes first, restore the custom dump/provider snapshot, refresh the
materialized view if the restore procedure requires it, restart the known-good
image, and repeat `/ready`, migration-table, and core smoke checks. Preserve
pre/post database identifiers and all command output.

### Evidence retention and cleanup

Keep the evidence directory, encrypted database dump/snapshot references,
checksums, provider restore reports, image digests, and the final decision for
the organization's audit retention period (minimum 90 days unless policy
requires longer). Do not store JWTs, passwords, access keys, or populated env
files in the evidence directory; redact them before archival. Restrict the
archive to the release/audit operators.

After the decision and evidence archive, clean up only the uniquely identified
R4 fixture rows/objects, BullMQ test jobs, and isolated restore database using
the approved staging cleanup procedure. Re-run the read-only counts and bucket
inventory afterward. Never delete a shared bucket, a pre-existing report, or
the only backup copy as part of test cleanup.

## 11. Go/no-go decision and evidence index

The release owner may mark R4 verified only when every hard gate below is
`PASS`:

| Gate | Required evidence |
| --- | --- |
| Candidate identity | source SHA and image digests |
| Backup | PostgreSQL dump/snapshot ID + checksum; object-storage snapshot/replica ID; Redis persistence evidence |
| Migrations | `_migrations` rows for 007/008, schema/constraint query, idempotent restart log |
| Runtime | `/live`, `/ready`, `/healthz`, `/metrics`; all health components healthy |
| Workers/storage | upload/report worker logs, BullMQ queue counters, both buckets visible |
| Baseline integration | upload pipeline and report-generation suites pass against real services |
| RBAC/security | live public redaction, role access/denials, report URL expiry; no skipped required test |
| Performance | warm p95 < 300 ms, cold p95 < 2 s, no failed requests |
| Confirmation | awaiting confirmation, correction/revision conflict, warning 409, confirm/persist, cancellation 409/no payment |
| Report filters | 008 fields persist and report completes with requested filters |
| Restore/rollback | isolated DB and object restore evidence; previous image starts and passes readiness |

Declare **no-go** for any failed or infrastructure-skipped hard gate, partial
migration, degraded storage/queue, missing backup/restore evidence, auth
bypass, warning bypass, stale-revision overwrite, or performance regression.
Record the failed gate, owner, remediation, and next attempt rather than
marking it verified.

At closeout, save a short decision record in the evidence directory:

```text
Release: <RELEASE_ID>
Candidate SHA/image: <value>
Staging target: <API/web origins>
Backup IDs/checksums: <values; no secrets>
Verification window (UTC): <start> – <end>
Hard gates: <pass count>/<total>
Rollback exercised: <yes/no; previous digest>
Restore exercised: <yes/no; isolated target/provider report>
Decision: GO | NO-GO
Approver(s): <names/roles>
Follow-up issues: <links or none>
```
