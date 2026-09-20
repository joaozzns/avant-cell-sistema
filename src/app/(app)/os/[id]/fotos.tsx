"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Camera, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { caminhoArquivo, comprimirImagem, extensaoDe } from "@/lib/fotos";
import { fmtDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fotosDaOs, registrarFoto, removerFoto, type FotoOs } from "./fotos-actions";

const MOMENTOS = ["Entrada", "Diagnóstico", "Reparo", "Saída"];

export function FotosOs({ osId, companyId }: { osId: string; companyId: string }) {
  const [fotos, setFotos] = useState<FotoOs[]>([]);
  const [momento, setMomento] = useState("Entrada");
  const [enviando, setEnviando] = useState(0);
  const [erro, setErro] = useState("");
  const [ampliada, setAmpliada] = useState<FotoOs | null>(null);
  const [, iniciar] = useTransition();
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => { fotosDaOs(osId).then(setFotos); }, [osId]);

  async function enviar(lista: FileList | null) {
    if (!lista?.length) return;
    setErro("");
    const supabase = createClient();
    const arquivos = Array.from(lista);
    setEnviando(arquivos.length);

    for (const arquivo of arquivos) {
      try {
        const comprimido = await comprimirImagem(arquivo);
        const caminho = caminhoArquivo(companyId, "os", osId, extensaoDe(comprimido));
        const { error } = await supabase.storage
          .from("os-media")
          .upload(caminho, comprimido, { contentType: comprimido.type || "image/jpeg" });
        if (error) throw new Error(error.message);
        const r = await registrarFoto(osId, caminho, momento);
        if (r.error) throw new Error(r.error);
      } catch (e) {
        setErro((e as Error).message);
      } finally {
        setEnviando((n) => n - 1);
      }
    }
    setFotos(await fotosDaOs(osId));
    if (entrada.current) entrada.current.value = "";
  }

  function apagar(f: FotoOs) {
    if (!confirm("Apagar esta foto? Ela é a prova do estado do aparelho.")) return;
    iniciar(async () => {
      const r = await removerFoto(osId, f.id);
      if (r.error) { setErro(r.error); return; }
      setFotos((atual) => atual.filter((x) => x.id !== f.id));
    });
  }

  return (
    <Card>
      <CardHeader className="border-b py-4">
        <CardTitle className="text-base">Fotos do aparelho</CardTitle>
        <p className="text-xs text-muted-foreground">
          Registre o estado na entrada e na saída. É o que protege a loja quando o cliente
          diz que o aparelho voltou diferente.
        </p>
      </CardHeader>
      <CardContent className="grid gap-3 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          {MOMENTOS.map((m) => (
            <button key={m} type="button" onClick={() => setMomento(m)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${momento === m ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
              {m}
            </button>
          ))}
        </div>

        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm font-medium hover:bg-muted">
          <Camera className="h-4 w-4" />
          {enviando > 0 ? `Enviando ${enviando} foto(s)…` : `Tirar ou escolher foto · ${momento}`}
          <input ref={entrada} type="file" accept="image/*" capture="environment" multiple hidden
            onChange={(e) => enviar(e.target.files)} />
        </label>

        {erro && <p className="text-sm text-destructive">{erro}</p>}

        {fotos.length === 0 && enviando === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma foto nesta OS ainda.</p>
        )}

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {fotos.map((f) => (
            <figure key={f.id} className="group relative overflow-hidden rounded-lg border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={f.rotulo ?? "Foto da OS"} loading="lazy"
                onClick={() => setAmpliada(f)}
                className="aspect-square w-full cursor-zoom-in object-cover" />
              <figcaption className="absolute inset-x-0 bottom-0 bg-black/55 px-1.5 py-1 text-[10px] text-white">
                {f.rotulo ?? "Foto"}
              </figcaption>
              <button type="button" onClick={() => apagar(f)} title="Apagar foto"
                className="absolute right-1 top-1 rounded-md bg-black/55 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </figure>
          ))}
        </div>
      </CardContent>

      {ampliada && (
        <div onClick={() => setAmpliada(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <button className="absolute right-4 top-4 rounded-md bg-white/10 p-2 text-white">
            <X className="h-5 w-5" />
          </button>
          <figure className="max-h-full max-w-3xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ampliada.url} alt={ampliada.rotulo ?? "Foto da OS"}
              className="max-h-[80dvh] w-auto rounded-lg object-contain" />
            <figcaption className="mt-2 text-center text-xs text-white/80">
              {ampliada.rotulo} · {fmtDateTime(ampliada.criadaEm)}
              {ampliada.autor && ` · ${ampliada.autor}`}
            </figcaption>
          </figure>
        </div>
      )}
    </Card>
  );
}
