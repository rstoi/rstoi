import { logoutAction } from "@/app/(auth)/actions";
import { USER_ROLE_LABELS } from "@/lib/labels";
import type { CurrentUser } from "@/lib/auth";

export function Topbar({ user, companyName }: { user: CurrentUser; companyName?: string }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-6">
      <div className="flex items-center gap-3">
        <span className="baita-gradient inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold text-white">
          B
        </span>
        <span className="text-sm font-semibold tracking-tight">Baita Financial Intelligence OS</span>
        {companyName && (
          <>
            <span className="text-muted">/</span>
            <span className="text-sm text-muted">{companyName}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-medium leading-tight">{user.name}</p>
          <p className="text-xs leading-tight text-muted">{USER_ROLE_LABELS[user.role] ?? user.role}</p>
        </div>
        <form action={logoutAction}>
          <button className="text-xs font-medium text-muted hover:text-baita-magenta">Sair</button>
        </form>
      </div>
    </header>
  );
}
