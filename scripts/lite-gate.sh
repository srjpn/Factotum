#!/usr/bin/env bash
# Lite-track gate (LT-18). Repeatable and non-destructive: GET requests, plus 401/404 probes.
# Only the section guarded by GATE_WRITE=1 writes, and it only appends activity-log entries.
# Needs curl and python3. Reads FACTO_API_URL (default http://127.0.0.1:3000), FACTO_ADMIN_TOKEN (required),
# FACTO_DASHBOARD_URL (default http://127.0.0.1:3001). Never prints the token.
# Exit code is non-zero if any check FAILs. See docs/runbooks/lite-gate.md for the manual part.
set -u
API="${FACTO_API_URL:-http://127.0.0.1:3000}"; API="${API%/}"
DASH="${FACTO_DASHBOARD_URL:-http://127.0.0.1:3001}"; DASH="${DASH%/}"
OFFLINE_AFTER="${FACTO_OFFLINE_AFTER_SECONDS:-90}"
TOKEN="${FACTO_ADMIN_TOKEN:-}"
PASS=0; FAIL=0; SKIP=0

res() { # status name reason
  case "$1" in PASS) PASS=$((PASS+1));; FAIL) FAIL=$((FAIL+1));; SKIP) SKIP=$((SKIP+1));; esac
  printf '%-4s %-34s %s\n' "$1" "$2" "$3"
}
command -v curl >/dev/null || { echo "curl is required"; exit 2; }
command -v python3 >/dev/null || { echo "python3 is required"; exit 2; }
if [ -z "$TOKEN" ]; then echo "FACTO_ADMIN_TOKEN is not set (load it with: set -a && . ./.env && set +a)"; exit 2; fi

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
# owner GET -> file; echoes HTTP status
oget() { curl -s -m 20 -o "$TMP/$2" -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$API$1" 2>/dev/null || echo 000; }
opost() { curl -s -m 20 -o "$TMP/$3" -w '%{http_code}' -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "$2" "$API$1" 2>/dev/null || echo 000; }
py() { python3 -I -c "$@"; }

echo "Factotum lite gate  $(date -u +%Y-%m-%dT%H:%M:%SZ)  api=$API"

# --- API and auth ---------------------------------------------------------
c=$(curl -s -m 10 -o "$TMP/health" -w '%{http_code}' "$API/health" 2>/dev/null || echo 000)
if [ "$c" = 200 ] && grep -q '"ok"' "$TMP/health"; then res PASS api-health "GET /health 200 status ok"
else res FAIL api-health "GET /health returned $c"; echo "API unreachable: remaining checks will fail"; fi

for r in /nodes /activity /inventory /adapters /approvals /privacy/policy; do
  n=0; m=0
  [ "$(curl -s -m 10 -o /dev/null -w '%{http_code}' "$API$r" 2>/dev/null)" = 401 ] || n=1
  [ "$(curl -s -m 10 -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer wrong-token' "$API$r" 2>/dev/null)" = 401 ] || m=1
  if [ $n = 0 ] && [ $m = 0 ]; then res PASS "auth$r" "401 without token and with wrong token"
  else res FAIL "auth$r" "expected 401 (missing ok=$((1-n)), wrong ok=$((1-m)))"; fi
done
c=$(curl -s -m 10 -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' "$API/nodes/enrolment-tokens" 2>/dev/null)
[ "$c" = 401 ] && res PASS auth/nodes/enrolment-tokens "POST without token 401" || res FAIL auth/nodes/enrolment-tokens "expected 401, got $c"
c=$(curl -s -m 10 -o /dev/null -w '%{http_code}' -X POST -H 'Authorization: Bearer facto_node_bogus' "$API/nodes/heartbeat" 2>/dev/null)
[ "$c" = 401 ] && res PASS auth/heartbeat-unknown "unknown node credential 401" || res FAIL auth/heartbeat-unknown "expected 401, got $c"

# --- Nodes ----------------------------------------------------------------
c=$(oget /nodes nodes.json)
if [ "$c" != 200 ]; then res FAIL node-online "GET /nodes returned $c"; else
out=$(py '
import sys,json,datetime as dt
nodes=json.load(open(sys.argv[1])); lim=int(sys.argv[2])
on=[n for n in nodes if n.get("status")=="online"]
if not on: print("FAIL no node is online (%d nodes, statuses %s)"%(len(nodes),sorted({n.get("status") for n in nodes}))); sys.exit()
n=on[0]; m=n.get("lastMetrics") or {}
miss=[k for k in ("cpuPercent","memory","disk") if k not in m]
hb=dt.datetime.fromisoformat(n["lastHeartbeatAt"].replace("Z","+00:00"))
age=(dt.datetime.now(dt.timezone.utc)-hb).total_seconds()
if miss: print("FAIL online node missing metrics: "+",".join(miss))
elif age>lim: print("FAIL heartbeat is %ds old (limit %ds)"%(age,lim))
else: print("PASS %d node(s) online; metrics cpu, memory, disk present; last heartbeat %ds ago"%(len(on),age))
' "$TMP/nodes.json" "$OFFLINE_AFTER")
res "${out%% *}" node-online "${out#* }"
out=$(py '
import json,sys
n=json.load(open(sys.argv[1]))
print("PASS battery metric present" if any("battery" in (x.get("lastMetrics") or {}) for x in n) else "SKIP no battery metric (desktop or agent without battery)")
' "$TMP/nodes.json"); res "${out%% *}" node-battery "${out#* }"
fi

# --- Activity log ---------------------------------------------------------
c=$(oget "/activity?limit=500" activity.json)
if [ "$c" != 200 ]; then res FAIL activity-read "GET /activity returned $c"; else
out=$(py '
import json,sys
a=json.load(open(sys.argv[1])); ok={"read","reversible","destructive","privileged"}
bad=[e for e in a if e.get("risk") not in ok]
if not a: print("FAIL activity log is empty")
elif bad: print("FAIL %d of %d entries have an invalid risk level"%(len(bad),len(a)))
else: print("PASS %d entries (newest 500), all with a valid risk level"%len(a))
' "$TMP/activity.json"); res "${out%% *}" activity-risk "${out#* }"
out=$(py '
import json,sys
a=json.load(open(sys.argv[1]))
m=[e for e in a if e.get("action") in ("node.online","node.offline") and e.get("actorId")=="node-status-monitor"]
if m: print("PASS %d node.online/offline entries from node-status-monitor (online %d, offline %d)"%(len(m),sum(e["action"]=="node.online" for e in m),sum(e["action"]=="node.offline" for e in m)))
else: print("FAIL no node.online or node.offline entry from node-status-monitor in the newest 500 entries")
' "$TMP/activity.json"); res "${out%% *}" node-status-logged "${out#* }"
out=$(py '
import json,sys
a=json.load(open(sys.argv[1]))
ids=[int(e["id"]) for e in a]
print("PASS ids strictly ordered, newest first" if ids==sorted(ids,reverse=True) and len(set(ids))==len(ids) else "FAIL ids not unique and ordered")
' "$TMP/activity.json"); res "${out%% *}" activity-order "${out#* }"
fi
ok=1; for m in DELETE PATCH PUT; do
  c=$(curl -s -m 10 -o /dev/null -w '%{http_code}' -X $m -H "Authorization: Bearer $TOKEN" "$API/activity" 2>/dev/null)
  c2=$(curl -s -m 10 -o /dev/null -w '%{http_code}' -X $m -H "Authorization: Bearer $TOKEN" "$API/activity/1" 2>/dev/null)
  case "$c" in 404|405) ;; *) ok=0;; esac; case "$c2" in 404|405) ;; *) ok=0;; esac
done
[ $ok = 1 ] && res PASS activity-append-only "no DELETE, PATCH or PUT route on /activity (404/405)" || res FAIL activity-append-only "a mutating method on /activity did not return 404/405"

# --- Adapters -------------------------------------------------------------
c=$(oget /adapters adapters.json)
if [ "$c" != 200 ]; then res FAIL adapters-up "GET /adapters returned $c"; else
out=$(py '
import json,sys
a=json.load(open(sys.argv[1]))
if not a: print("FAIL no adapters registered"); sys.exit()
bad=[x for x in a if x.get("status")!="up"]
names=",".join(sorted(x["name"] for x in a))
if bad: print("FAIL %d of %d not up: %s; registered: %s"%(len(bad),len(a),"; ".join("%s=%s (%s)"%(x["name"],x["status"],x.get("statusDetail")) for x in bad),names))
else: print("PASS %d adapters up: %s"%(len(a),names))
' "$TMP/adapters.json"); res "${out%% *}" adapters-up "${out#* }"
out=$(py '
import json,sys
a=json.load(open(sys.argv[1])); bad=[x["name"] for x in a if x.get("tier") is None or not x.get("scopes")]
print("PASS every adapter has a tier and scopes" if not bad else "FAIL adapters without tier or scopes: "+",".join(bad))
' "$TMP/adapters.json"); res "${out%% *}" adapters-declared "${out#* }"
fi

# --- Inventory ------------------------------------------------------------
c=$(oget /inventory inventory.json)
if [ "$c" != 200 ]; then res FAIL inventory-kinds "GET /inventory returned $c"; else
py '
import json,sys,collections
inv=json.load(open(sys.argv[1]))
by=collections.defaultdict(list)
for i in inv: by[i["kind"]].append(i)
def cnt(k): return len(by.get(k,[]))
for k in ("task","run","container","backup","service","claude-session","claude-usage"):
    n=cnt(k)
    if n: print("PASS inventory-%s %d items, adapters %s, privacy %s"%(k,n,sorted({i["adapter"] for i in by[k]}),dict(collections.Counter(i["privacyClass"] for i in by[k]))))
    elif k in ("task",): print("FAIL inventory-%s no items"%k)
    else: print("FAIL inventory-%s no items (adapter missing or not synced)"%k)
tasks=by.get("task",[])
j=[i for i in tasks if i["adapter"]=="jira"]; t=[i for i in tasks if i["adapter"]=="trello"]
print(("PASS" if j and all(i["privacyClass"]=="client-data" for i in j) else "FAIL" if j else "SKIP")+" privacy-jira %s"%("%d Jira tasks, all client-data"%len(j) if j and all(i["privacyClass"]=="client-data" for i in j) else "Jira tasks not client-data" if j else "no Jira tasks"))
print(("PASS" if t and all(i["privacyClass"]=="personal" for i in t) else "FAIL" if t else "SKIP")+" privacy-trello %s"%("%d Trello tasks, all personal"%len(t) if t and all(i["privacyClass"]=="personal" for i in t) else "Trello tasks not personal" if t else "no Trello tasks (live check pending credentials)"))
p=[i for i in by.get("run",[]) if i["adapter"]=="pani"]
print(("PASS" if p and all(i["privacyClass"]=="client-data" for i in p) else "FAIL" if p else "SKIP")+" privacy-pani-runs %s"%("%d Pani runs, all client-data"%len(p) if p and all(i["privacyClass"]=="client-data" for i in p) else "Pani runs not client-data" if p else "no Pani runs"))
bad=[i for i in inv if i.get("privacyClass") not in ("personal","client-data")]
print(("PASS" if not bad else "FAIL")+" privacy-all %s"%("all %d items carry a privacy class"%len(inv) if not bad else "%d items lack a valid privacy class"%len(bad)))
' "$TMP/inventory.json" | while IFS= read -r line; do
    s="${line%% *}"; rest="${line#* }"; n="${rest%% *}"; r="${rest#* }"
    printf '%s\t%s\t%s\n' "$s" "$n" "$r"
  done > "$TMP/inv.tsv"
while IFS=$'\t' read -r s n r; do res "$s" "$n" "$r"; done < "$TMP/inv.tsv"
fi

# --- Secrets scan ---------------------------------------------------------
if [ -s "$TMP/activity.json" ] && [ -s "$TMP/inventory.json" ]; then
  out=$(TOK="$TOKEN" py '
import os,re,sys
tok=os.environ["TOK"]; bad=[]
for f in sys.argv[1:]:
    s=open(f,encoding="utf-8",errors="replace").read()
    for p in ("facto_node_","facto_adp_","facto_enrol_"):
        if p in s: bad.append("%s in %s"%(p,os.path.basename(f)))
    if tok and tok in s: bad.append("owner token in %s"%os.path.basename(f))
print("FAIL secret pattern found: "+"; ".join(bad) if bad else "PASS no token prefixes or owner token in /activity (500) or /inventory output")
' "$TMP/activity.json" "$TMP/inventory.json"); res "${out%% *}" no-secrets-in-output "${out#* }"
else res SKIP no-secrets-in-output "activity or inventory not fetched"; fi

# --- Approvals, policy, privacy -------------------------------------------
c=$(oget /approvals approvals.json)
[ "$c" = 200 ] && res PASS approvals-reachable "GET /approvals 200 ($(py 'import json,sys;print(len(json.load(open(sys.argv[1]))))' "$TMP/approvals.json") approvals)" || res FAIL approvals-reachable "GET /approvals returned $c"
c=$(oget /privacy/policy policy.json)
if [ "$c" != 200 ]; then res FAIL privacy-policy "GET /privacy/policy returned $c"; else
  out=$(py '
import json,sys
p=json.load(open(sys.argv[1])); cd=p.get("client-data")
print("PASS client-data allowed targets: %s; personal: %s"%("none (fail closed)" if cd==[] else cd,p.get("personal")))
' "$TMP/policy.json"); res "${out%% *}" privacy-policy "${out#* }"
fi

# --- Dashboard and exposure -----------------------------------------------
c=$(curl -s -m 10 -o /dev/null -w '%{http_code}' "$DASH/login" 2>/dev/null)
[ "$c" = 200 ] && res PASS dashboard-login "GET /login 200" || res FAIL dashboard-login "GET /login returned $c"
o=$(curl -s -m 10 -o /dev/null -w '%{http_code} %{redirect_url}' "$DASH/" 2>/dev/null)
case "$o" in 30[1278]\ *login*) res PASS dashboard-auth-redirect "/ redirects to login when unauthenticated";; *) res FAIL dashboard-auth-redirect "expected redirect to /login, got: $o";; esac

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  pub=$(docker ps --filter publish=3000 --filter publish=3001 --format '{{.Names}} {{.Ports}}' 2>/dev/null | grep -E 'factotum' || true)
  if [ -z "$pub" ]; then res SKIP private-by-default "no Factotum container publishes 3000 or 3001"
  elif echo "$pub" | grep -E '(^|[ ,])(0\.0\.0\.0|\[::\]|:::)[:]?[0-9]*->' >/dev/null; then res FAIL private-by-default "a Factotum port is bound to all interfaces: $(echo "$pub" | tr '\n' ';')"
  else res PASS private-by-default "published ports bound to 127.0.0.1 only"; fi
else res SKIP private-by-default "docker not available"; fi
if grep -q 'FACTO_BIND_ADDR:-127.0.0.1' "$(dirname "$0")/../docker-compose.yml" 2>/dev/null; then res PASS compose-default-bind "docker-compose.yml defaults to 127.0.0.1"
else res FAIL compose-default-bind "docker-compose.yml does not default FACTO_BIND_ADDR to 127.0.0.1"; fi

# --- Portability (LT-19) --------------------------------------------------
if [ -f "$(dirname "$0")/../docs/runbooks/move-control-plane.md" ]; then
  res SKIP portability-runbook "runbook exists; the move itself is a manual step (docs/runbooks/lite-gate.md)"
else res SKIP portability-runbook "docs/runbooks/move-control-plane.md not on this branch"; fi

# --- Optional write section -----------------------------------------------
if [ "${GATE_WRITE:-0}" = 1 ]; then
  echo "-- GATE_WRITE=1: appends activity-log entries only (no external system is touched) --"
  before=$(py 'import json,sys;a=json.load(open(sys.argv[1]));print(max(int(e["id"]) for e in a))' "$TMP/activity.json" 2>/dev/null || echo 0)
  c=$(opost /privacy/check '{"privacyClass":"client-data","target":"gate-test-untrusted-host","action":"gate.check"}' pc.json)
  d=$(py 'import json,sys;print(json.load(open(sys.argv[1])).get("decision"))' "$TMP/pc.json" 2>/dev/null)
  if [ "$c" = 200 ] && [ "$d" = deny ]; then res PASS privacy-deny "client-data to an unlisted target refused"; else res FAIL privacy-deny "expected 200 deny, got $c $d"; fi
  oget "/activity?limit=50" act2.json >/dev/null
  out=$(py '
import json,sys
a=json.load(open(sys.argv[1])); b=int(sys.argv[2])
m=[e for e in a if e["action"]=="privacy.deny" and int(e["id"])>b and e.get("targetId")=="gate-test-untrusted-host"]
print("PASS privacy.deny logged (outcome %s, risk %s)"%(m[0]["outcome"],m[0]["risk"]) if m else "FAIL no privacy.deny entry after the refusal")
' "$TMP/act2.json" "$before"); res "${out%% *}" privacy-deny-logged "${out#* }"
  c=$(opost /privacy/check '{"privacyClass":"personal","target":"macbook"}' pc2.json)
  d=$(py 'import json,sys;print(json.load(open(sys.argv[1])).get("decision"))' "$TMP/pc2.json" 2>/dev/null)
  [ "$c" = 200 ] && [ "$d" = allow ] && res PASS privacy-personal-allow "personal target allowed (policy lists personal as *)" || res SKIP privacy-personal-allow "personal not open to any target in this config ($c $d)"
  c=$(opost /actions/request '{"action":"gate.read-probe","risk":"read","summary":"lite gate probe"}' ar1.json)
  s=$(py 'import json,sys;print(json.load(open(sys.argv[1])).get("status") or json.load(open(sys.argv[1])).get("decision"))' "$TMP/ar1.json" 2>/dev/null)
  [ "$s" = allowed ] && res PASS policy-read-allowed "read action allowed at once" || res FAIL policy-read-allowed "got $c $s"
  c=$(opost /actions/request '{"action":"gate.destructive-probe","risk":"destructive","summary":"lite gate probe, deny me"}' ar2.json)
  s=$(py 'import json,sys;d=json.load(open(sys.argv[1]));print(d.get("status") or d.get("decision"))' "$TMP/ar2.json" 2>/dev/null)
  id=$(py 'import json,sys;d=json.load(open(sys.argv[1]));print(d.get("approvalId") or (d.get("approval") or {}).get("id") or d.get("id") or "")' "$TMP/ar2.json" 2>/dev/null)
  if [ "$s" = pending ] && [ -n "$id" ]; then
    res PASS policy-destructive-pending "destructive action waits for approval"
    c=$(opost "/approvals/$id/deny" '{}' dn.json)
    [ "$c" = 200 ] || [ "$c" = 201 ] && res PASS approval-deny-logged "probe approval denied by owner ($c)" || res FAIL approval-deny-logged "deny returned $c"
  else res FAIL policy-destructive-pending "got $c $s id=${id:-none}"; fi
else
  res SKIP write-section "set GATE_WRITE=1 to run privacy-deny and policy-tier probes (append log entries only)"
fi

echo "---- PASS $PASS  FAIL $FAIL  SKIP $SKIP"
[ "$FAIL" -eq 0 ]
