"use client";

import { ShieldAlert, ArrowLeft, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCurrentUser, useLogout } from "@/hooks/use-auth";

export default function UnauthorizedPage() {
  const router = useRouter();
  const { data: userData } = useCurrentUser();
  const logout = useLogout();
  const user = userData?.user;

  const getRoleLandingHref = () => {
    if (!user) return "/login";
    const role = user.roleName;
    const permissions = user.permissions || [];
    if (role === "DELIVERY_STAFF" && permissions.includes("delivery.rider")) {
      return "/my-deliveries";
    }
    if (role === "KITCHEN_STAFF") {
      return "/kds";
    }
    if (role === "CASHIER" || role === "WAITER") {
      return "/pos";
    }
    return "/dashboard";
  };

  const handleReturnToWorkspace = () => {
    router.push(getRoleLandingHref());
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <Card className="flex w-full max-w-md flex-col items-center gap-6 p-8 text-center shadow-lg">
        <Link href="/" className="transition-transform hover:scale-105">
          <Logo size={56} />
        </Link>

        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldAlert className="h-8 w-8" />
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Access Restricted
          </h1>
          <p className="text-sm text-muted-foreground">
            Your role (<span className="font-semibold text-foreground">{user?.roleName ?? "Staff"}</span>) does not have permission to access this module or direct URL.
          </p>
          <p className="text-xs text-muted-foreground/80">
            If you need access to this section, please ask your restaurant Super Admin or Manager.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2.5 sm:flex-row">
          <Button
            className="flex-1 gap-2"
            onClick={handleReturnToWorkspace}
          >
            <ArrowLeft className="h-4 w-4" />
            Go to Your Workplace
          </Button>
          <Button
            variant="outline"
            className="flex-1 gap-2 text-muted-foreground hover:text-foreground"
            onClick={() => logout.mutate(undefined, { onSuccess: () => router.push("/login") })}
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </Card>
    </div>
  );
}
