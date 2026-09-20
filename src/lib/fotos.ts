/**
 * Fotos tiradas no balcão: o celular gera arquivos de 3 a 6 MB, o que enche o
 * armazenamento e demora para enviar no 4G da loja. Aqui a foto é reduzida no
 * próprio navegador antes de subir — lado maior de 1600px e JPEG de qualidade
 * 0,72, o que costuma deixar o arquivo entre 150 e 400 KB sem perder o que
 * importa (trinca, risco, número de série).
 */

const LADO_MAXIMO = 1600;
const QUALIDADE = 0.72;

export async function comprimirImagem(arquivo: File): Promise<Blob> {
  if (!arquivo.type.startsWith("image/")) return arquivo;

  const bitmap = await createImageBitmap(arquivo).catch(() => null);
  if (!bitmap) return arquivo;

  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  const largura = Math.round(bitmap.width * escala);
  const altura = Math.round(bitmap.height * escala);

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) return arquivo;
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((ok) =>
    canvas.toBlob(ok, "image/jpeg", QUALIDADE),
  );
  // se a compressão não ajudou (imagem já pequena), manda o original
  return blob && blob.size < arquivo.size ? blob : arquivo;
}

/** Caminho do arquivo no bucket. O primeiro nível é a empresa — é o que a
 *  regra de acesso do banco confere para não misturar arquivos entre lojas. */
export function caminhoArquivo(companyId: string, escopo: string, id: string, extensao = "jpg") {
  const aleatorio = crypto.randomUUID().slice(0, 8);
  return `${companyId}/${escopo}/${id}/${Date.now()}-${aleatorio}.${extensao}`;
}

export function extensaoDe(arquivo: File | Blob, padrao = "jpg") {
  const tipo = arquivo.type || "";
  if (tipo.includes("png")) return "png";
  if (tipo.includes("webp")) return "webp";
  if (tipo.includes("pdf")) return "pdf";
  if (tipo.includes("mp4")) return "mp4";
  return padrao;
}
