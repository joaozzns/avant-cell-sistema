/* IMEI: 15 digitos com digito verificador (Luhn). Mesma regra de
   app.imei_is_valid no banco — aqui para responder antes de gravar. */
export function imeiValido(imei: string): boolean {
  if (!/^\d{15}$/.test(imei)) return false;
  let soma = 0;
  for (let i = 0; i < 15; i++) {
    let n = +imei[i];
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    soma += n;
  }
  return soma % 10 === 0;
}
