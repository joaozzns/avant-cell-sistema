"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Campo de senha com botão de olho para conferir o que foi digitado.
 * Usa os mesmos atributos de um Input comum.
 */
export function CampoSenha(props: React.ComponentProps<typeof Input>) {
  const [visivel, setVisivel] = useState(false);

  return (
    <div className="relative">
      <Input {...props} type={visivel ? "text" : "password"} className="pr-10" />
      <button
        type="button"
        onClick={() => setVisivel((v) => !v)}
        aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visivel}
        title={visivel ? "Ocultar senha" : "Mostrar senha"}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        {visivel ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
