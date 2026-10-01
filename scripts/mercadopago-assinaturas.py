#!/usr/bin/env python3
"""Lista e cancela assinaturas no Mercado Pago.

    export MP_ACCESS_TOKEN="APP_USR-..."

    python3 scripts/mercadopago-assinaturas.py                 # lista
    python3 scripts/mercadopago-assinaturas.py --cancelar ID   # cancela uma

Cancelar e definitivo: o Mercado Pago nao reativa assinatura cancelada, o
assinante precisa assinar de novo. Por isso o id vem na linha de comando, um
de cada vez, e nunca ha um "cancelar todas".
"""

import json, os, sys, urllib.request, urllib.error

API = "https://api.mercadopago.com"


def chamar(caminho, metodo="GET", corpo=None):
    token = os.environ.get("MP_ACCESS_TOKEN", "").strip()
    if not token:
        sys.exit("Defina MP_ACCESS_TOKEN no ambiente.")
    dados = json.dumps(corpo).encode() if corpo is not None else None
    req = urllib.request.Request(
        API + caminho, data=dados, method=metodo,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r), None
    except urllib.error.HTTPError as e:
        return None, f"HTTP {e.code}: {e.read().decode()[:300]}"
    except Exception as e:
        return None, str(e)


def listar():
    dados, erro = chamar("/preapproval/search?limit=50")
    if erro:
        sys.exit(f"Nao consegui listar: {erro}")
    itens = dados.get("results", [])
    if not itens:
        print("Nenhuma assinatura na conta.")
        return
    print(f"{len(itens)} assinatura(s):\n")
    for a in itens:
        valor = (a.get("auto_recurring") or {}).get("transaction_amount")
        print(f"  {a.get('status','?'):12s} R$ {valor if valor is not None else '?':>8}  "
              f"{(a.get('reason') or '')[:46]}")
        print(f"       id: {a.get('id')}")
        if a.get("payer_email"):
            print(f"       assinante: {a['payer_email']}")
        print(f"       referencia (empresa): {a.get('external_reference') or '— nenhuma —'}")
        print()


def cancelar(assinatura):
    atual, erro = chamar(f"/preapproval/{assinatura}")
    if erro:
        sys.exit(f"Nao achei essa assinatura: {erro}")
    valor = (atual.get("auto_recurring") or {}).get("transaction_amount")
    print(f"Assinatura: {atual.get('reason')}")
    print(f"Situacao atual: {atual.get('status')} · R$ {valor}")
    if atual.get("status") == "cancelled":
        print("Ja esta cancelada. Nada a fazer.")
        return
    resposta = input("\nCancelar em definitivo? (digite SIM) ").strip()
    if resposta != "SIM":
        print("Nada foi feito.")
        return
    _, erro = chamar(f"/preapproval/{assinatura}", "PUT", {"status": "cancelled"})
    if erro:
        sys.exit(f"Falhou: {erro}")
    print("Cancelada. Nao havera novas cobrancas.")


if __name__ == "__main__":
    if "--cancelar" in sys.argv:
        i = sys.argv.index("--cancelar")
        if i + 1 >= len(sys.argv):
            sys.exit("Falta o id: --cancelar <id>")
        cancelar(sys.argv[i + 1])
    else:
        listar()
