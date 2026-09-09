"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { supportNavigation } from "@/lib/navigation/support";
import { cn } from "@/lib/utils";

/** Compartilhado pela lateral desktop e pelo drawer mobile. */
export function SupportNavigation({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const { user, activeOrg } = useAuth();
  const t = useT();
  const pathname = usePathname();
  const items = supportNavigation(user, activeOrg);
  if (!items.length) return null;
  return (
    <section
      aria-label={t("Administração da organização")}
      className="space-y-1 rounded-md border border-primary/20 bg-primary/5 p-1"
    >
      {!collapsed && (
        <h2 className="px-2 py-2 text-xs font-semibold text-primary">
          {t("Administração da organização")}
        </h2>
      )}
      <ul className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                title={t(item.label)}
                aria-label={collapsed ? t(item.label) : undefined}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent/50",
                  active && "bg-accent text-accent-foreground",
                  collapsed && "justify-center",
                )}
              >
                <Icon size={18} aria-hidden />
                {!collapsed && <span className="truncate">{t(item.label)}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
