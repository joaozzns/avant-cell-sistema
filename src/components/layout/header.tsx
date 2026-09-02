import { logout } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function Header({
  userName,
  storeName,
}: {
  userName: string;
  storeName?: string;
}) {
  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-3">
        {storeName && <Badge variant="secondary">{storeName}</Badge>}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">{userName}</span>
        <form action={logout}>
          <Button variant="outline" size="sm" type="submit">
            Sair
          </Button>
        </form>
      </div>
    </header>
  );
}
