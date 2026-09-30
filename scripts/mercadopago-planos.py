#!/usr/bin/env python3
"""Cria os planos de assinatura do Avant Cell no Mercado Pago.

O token NUNCA fica no arquivo. Ele vem do ambiente:

    export MP_ACCESS_TOKEN="TEST-..."       # teste
    python3 scripts/mercadopago-planos.py

    export MP_ACCESS_TOKEN="APP_USR-..."    # producao
    python3 scripts/mercadopago-planos.py --producao

Os planos criados com o token de teste NAO existem em producao: na virada,
rode de novo com o token de producao e troque os links no site. Por isso isto
e um script e nao um punhado de cliques no painel.

Assinatura recorrente no Mercado Pago so roda em cartao de credito. Pix e
boleto nao renovam sozinhos.
"""

import json, os, sys, urllib.request, urllib.error

API = "https://api.mercadopago.com/preapproval_plan"

# Para onde a pessoa volta depois de assinar. Precisa ser uma URL que existe.
RETORNO = os.environ.get("MP_BACK_URL", "https://avant-cell-sistema.vercel.app/login")

# Dias de teste gratis. 0 desliga.
TESTE_GRATIS_DIAS = int(os.environ.get("MP_TRIAL_DIAS", "0"))

# --- A DECISAO DO PLANO ANUAL -------------------------------------------
# "uma_vez": cobra o ano inteiro de uma vez (R$ 900 no Essencial).
# "parcelado": cobra o valor mensal com desconto por 12 meses e encerra.
# O site anuncia "R$ 75 Mensal" na aba Anual, o que combina com as duas.
ANUAL = os.environ.get("MP_ANUAL", "uma_vez")

MENSAIS = [("Essencial", 97), ("Profissional", 127), ("Premium", 197)]
ANUAIS  = [("Essencial", 75), ("Profissional", 97), ("Premium", 149)]


def plano(nome, periodo, valor, frequencia, tipo, repeticoes=None):
    corpo = {
        "reason": f"Avant Cell — {nome} ({periodo})",
        "auto_recurring": {
            "frequency": frequencia,
            "frequency_type": tipo,
            "transaction_amount": valor,
            "currency_id": "BRL",
        },
        "back_url": RETORNO,
        "payment_methods_allowed": {"payment_types": [{"id": "credit_card"}]},
    }
    if repeticoes:
        corpo["auto_recurring"]["repetitions"] = repeticoes
    if TESTE_GRATIS_DIAS:
        corpo["auto_recurring"]["free_trial"] = {
            "frequency": TESTE_GRATIS_DIAS, "frequency_type": "days"
        }
    return corpo


def montar():
    planos = [plano(n, "mensal", v, 1, "months") for n, v in MENSAIS]
    for n, v in ANUAIS:
        if ANUAL == "uma_vez":
            planos.append(plano(n, "anual", round(v * 12, 2), 12, "months"))
        else:
            planos.append(plano(n, "anual", v, 1, "months", repeticoes=12))
    return planos


def criar(corpo, token):
    req = urllib.request.Request(
        API, data=json.dumps(corpo).encode(),
        headers={"Authorization": f"Bearer {token}",
                 "Content-Type": "application/json"},
        method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r), None
    except urllib.error.HTTPError as e:
        return None, f"HTTP {e.code}: {e.read().decode()[:300]}"
    except Exception as e:
        return None, str(e)


def main():
    token = os.environ.get("MP_ACCESS_TOKEN", "").strip()
    if not token:
        sys.exit("Defina MP_ACCESS_TOKEN no ambiente (nao no arquivo).")

    producao = "--producao" in sys.argv
    parece_teste = token.startswith("TEST-")
    if producao and parece_teste:
        sys.exit("--producao com um token TEST-: isso criaria planos de mentira.")
    if not producao and not parece_teste:
        sys.exit("Token de producao sem --producao. Repita com --producao se e isso "
                 "mesmo: os links gerados vao cobrar dinheiro de verdade.")

    print(f"ambiente: {'PRODUCAO' if producao else 'teste'}")
    print(f"plano anual: {ANUAL} · teste gratis: {TESTE_GRATIS_DIAS or 'nenhum'} dia(s)")
    print(f"retorno: {RETORNO}\n")

    resultados = []
    for corpo in montar():
        dados, erro = criar(corpo, token)
        nome = corpo["reason"]
        if erro:
            print(f"  FALHOU  {nome}\n          {erro}")
            continue
        valor = corpo["auto_recurring"]["transaction_amount"]
        print(f"  criado  {nome}  R$ {valor:.2f}")
        print(f"          id:   {dados['id']}")
        print(f"          link: {dados.get('init_point', '(sem init_point)')}")
        resultados.append({"nome": nome, "valor": valor, "id": dados["id"],
                           "link": dados.get("init_point")})

    if resultados:
        saida = f"planos-mercadopago-{'producao' if producao else 'teste'}.json"
        with open(saida, "w") as f:
            json.dump(resultados, f, indent=2, ensure_ascii=False)
        print(f"\n{len(resultados)} plano(s). Links salvos em {saida}")
        print("Sao esses links que entram nos botoes do site.")


if __name__ == "__main__":
    main()
