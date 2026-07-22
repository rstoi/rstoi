#!/usr/bin/env python3
"""
Auditoria GCP via REST — funciona sem gcloud, usando um access token curto.
Uso:
    GCP_TOKEN="$(gcloud auth print-access-token)" python3 audit_gcp_rest.py
    # ou
    python3 audit_gcp_rest.py <ACCESS_TOKEN>

Todas as chamadas passam pelo proxy do agente (HTTPS_PROXY) com o CA bundle.
Somente leitura: nenhuma chamada de escrita/mutação é feita.
"""
import os, sys, json, subprocess

TOKEN = os.environ.get("GCP_TOKEN") or (sys.argv[1] if len(sys.argv) > 1 else "")
if not TOKEN:
    sys.exit('Falta o token. Uso: GCP_TOKEN="$(gcloud auth print-access-token)" python3 audit_gcp_rest.py')

CA = os.environ.get("CLOUDSDK_CORE_CUSTOM_CA_CERTS_FILE", "/root/.ccr/ca-bundle.crt")
OUT_JSON = os.environ.get("AUDIT_OUT", "audit-gcp-result.json")

def api(url):
    """GET autenticado via curl (respeita HTTPS_PROXY + CA). Retorna dict."""
    try:
        p = subprocess.run(
            ["curl", "-sS", "--max-time", "45", "--cacert", CA,
             "-H", f"Authorization: Bearer {TOKEN}", url],
            capture_output=True, text=True, timeout=70)
        out = p.stdout.strip()
        return json.loads(out) if out else {}
    except json.JSONDecodeError:
        return {"error": {"message": "resposta não-JSON", "raw": out[:200]}}
    except Exception as e:
        return {"error": {"message": str(e)}}

def errmsg(d):
    if isinstance(d, dict) and "error" in d:
        e = d["error"]
        if isinstance(e, dict):
            return e.get("message") or e.get("status") or str(e)
        return str(e)
    return None

def aggregated_items(d, key):
    """compute aggregatedList: items = { 'zones/x': {key: [...]}, ... }"""
    res = []
    for scope, block in (d.get("items") or {}).items():
        for item in (block.get(key) or []):
            item["_scope"] = scope.split("/")[-1]
            res.append(item)
    return res

def hdr(t): print(f"\n{'='*70}\n{t}\n{'='*70}")
def sub(t): print(f"\n-- {t} --")

report = {"token_identity": None, "projects": {}}

# ---- Identidade do token ----
hdr("IDENTIDADE DO TOKEN")
who = api("https://www.googleapis.com/oauth2/v3/userinfo")
em = who.get("email") if isinstance(who, dict) else None
if em:
    print(f"  Conta: {em}")
    report["token_identity"] = em
else:
    # userinfo pode não estar no escopo; tenta tokeninfo
    print("  (userinfo indisponível; seguindo mesmo assim)")

# ---- Projetos ----
hdr("PROJETOS")
pj = api("https://cloudresourcemanager.googleapis.com/v1/projects")
e = errmsg(pj)
if e:
    print(f"  ERRO ao listar projetos: {e}")
    print("  -> Token inválido/expirado ou sem escopo cloud-platform. Aborta.")
    sys.exit(3)

projects = [p for p in pj.get("projects", []) if p.get("lifecycleState") == "ACTIVE"]
print(f"  {len(projects)} projeto(s) ativo(s):")
for p in projects:
    print(f"    - {p['projectId']:34} {p.get('name','')}")

idle = {"unattached_disks": [], "reserved_addresses": [], "stopped_instances": []}

for p in projects:
    pid = p["projectId"]
    hdr(f"PROJETO: {pid}")
    pr = report["projects"][pid] = {}

    sub("APIs habilitadas")
    sv = api(f"https://serviceusage.googleapis.com/v1/projects/{pid}/services?filter=state:ENABLED&pageSize=300")
    if errmsg(sv):
        print(f"  (indisponível: {errmsg(sv)})")
    else:
        names = sorted(s.get("config", {}).get("name", "") for s in sv.get("services", []))
        pr["enabled_apis"] = names
        print(f"  {len(names)} APIs habilitadas:")
        for n in names:
            print(f"    {n}")

    sub("Instâncias Compute Engine")
    ins = api(f"https://compute.googleapis.com/compute/v1/projects/{pid}/aggregated/instances")
    if errmsg(ins):
        print(f"  (indisponível: {errmsg(ins)})")
    else:
        items = aggregated_items(ins, "instances")
        pr["instances"] = [{"name": i["name"], "zone": i["_scope"],
                            "machineType": i.get("machineType", "").split("/")[-1],
                            "status": i.get("status")} for i in items]
        if not items:
            print("  (nenhuma)")
        for i in items:
            mt = i.get("machineType", "").split("/")[-1]
            print(f"    {i['name']:30} {i['_scope']:16} {mt:16} {i.get('status')}")
            if i.get("status") in ("TERMINATED", "STOPPED"):
                idle["stopped_instances"].append(f"{pid}/{i['_scope']}/{i['name']}")

    sub("Discos NÃO anexados (custo ocioso)")
    dk = api(f"https://compute.googleapis.com/compute/v1/projects/{pid}/aggregated/disks")
    if errmsg(dk):
        print(f"  (indisponível: {errmsg(dk)})")
    else:
        orphans = [d for d in aggregated_items(dk, "disks") if not d.get("users")]
        pr["unattached_disks"] = [{"name": d["name"], "zone": d["_scope"],
                                   "sizeGb": d.get("sizeGb")} for d in orphans]
        if not orphans:
            print("  (nenhum — bom)")
        for d in orphans:
            print(f"    {d['name']:30} {d['_scope']:16} {d.get('sizeGb')}GB")
            idle["unattached_disks"].append(f"{pid}/{d['_scope']}/{d['name']} ({d.get('sizeGb')}GB)")

    sub("IPs estáticos RESERVADOS sem uso (custo ocioso)")
    ad = api(f"https://compute.googleapis.com/compute/v1/projects/{pid}/aggregated/addresses")
    if errmsg(ad):
        print(f"  (indisponível: {errmsg(ad)})")
    else:
        unused = [a for a in aggregated_items(ad, "addresses") if a.get("status") == "RESERVED"]
        pr["reserved_unused_addresses"] = [{"name": a["name"], "region": a["_scope"],
                                            "address": a.get("address")} for a in unused]
        if not unused:
            print("  (nenhum — bom)")
        for a in unused:
            print(f"    {a['name']:30} {a['_scope']:16} {a.get('address')}")
            idle["reserved_addresses"].append(f"{pid}/{a['_scope']}/{a['name']} ({a.get('address')})")

    sub("Cloud Run (serviços)")
    run = api(f"https://run.googleapis.com/v2/projects/{pid}/locations/-/services")
    if errmsg(run):
        print(f"  (indisponível: {errmsg(run)})")
    else:
        svcs = run.get("services", [])
        pr["cloud_run"] = [{"name": s.get("name", "").split("/")[-1], "uri": s.get("uri")} for s in svcs]
        if not svcs:
            print("  (nenhum)")
        for s in svcs:
            print(f"    {s.get('name','').split('/')[-1]:30} {s.get('uri','')}")

    sub("Cloud Functions")
    fn = api(f"https://cloudfunctions.googleapis.com/v2/projects/{pid}/locations/-/functions")
    if errmsg(fn):
        print(f"  (indisponível: {errmsg(fn)})")
    else:
        fns = fn.get("functions", [])
        pr["functions"] = [{"name": f.get("name", "").split("/")[-1], "state": f.get("state")} for f in fns]
        if not fns:
            print("  (nenhuma)")
        for f in fns:
            print(f"    {f.get('name','').split('/')[-1]:40} {f.get('state')}")

    sub("Cloud Scheduler (crons)")
    sc = api(f"https://cloudscheduler.googleapis.com/v1/projects/{pid}/locations/-/jobs")
    if errmsg(sc):
        print(f"  (indisponível: {errmsg(sc)})")
    else:
        jobs = sc.get("jobs", [])
        pr["scheduler_jobs"] = [{"name": j.get("name", "").split("/")[-1],
                                 "schedule": j.get("schedule"), "state": j.get("state")} for j in jobs]
        if not jobs:
            print("  (nenhum)")
        for j in jobs:
            print(f"    {j.get('name','').split('/')[-1]:30} {j.get('schedule',''):20} {j.get('state')}")

    sub("BigQuery datasets")
    bq = api(f"https://bigquery.googleapis.com/bigquery/v2/projects/{pid}/datasets")
    if errmsg(bq):
        print(f"  (indisponível: {errmsg(bq)})")
    else:
        ds = bq.get("datasets", [])
        pr["bigquery_datasets"] = [d.get("datasetReference", {}).get("datasetId") for d in ds]
        if not ds:
            print("  (nenhum)")
        for d in ds:
            print(f"    {d.get('datasetReference',{}).get('datasetId')}")

    sub("Contas de serviço")
    sa = api(f"https://iam.googleapis.com/v1/projects/{pid}/serviceAccounts")
    if errmsg(sa):
        print(f"  (indisponível: {errmsg(sa)})")
    else:
        accs = sa.get("accounts", [])
        pr["service_accounts"] = [{"email": a.get("email"), "disabled": a.get("disabled", False)} for a in accs]
        print(f"  {len(accs)} conta(s):")
        for a in accs:
            flag = " [DESABILITADA]" if a.get("disabled") else ""
            print(f"    {a.get('email')}{flag}")

# ---- Resumo de custo ocioso ----
hdr("RESUMO — QUICK WINS DE CUSTO OCIOSO")
def block(title, items):
    print(f"\n  {title}: {len(items)}")
    for it in items:
        print(f"    • {it}")
block("Discos órfãos (deletar se confirmado)", idle["unattached_disks"])
block("IPs reservados sem uso (liberar)", idle["reserved_addresses"])
block("Instâncias paradas (avaliar deleção)", idle["stopped_instances"])
report["idle_cost_summary"] = idle

with open(OUT_JSON, "w") as f:
    json.dump(report, f, indent=2, ensure_ascii=False)
print(f"\nJSON completo salvo em: {OUT_JSON}")
