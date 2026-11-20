import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DashboardGate } from "@/components/dashboards/DashboardGate";
import { supabase } from "@/integrations/supabase/client";
import { RecoveryCodes } from "@/components/MfaGate";
import { useApp } from "@/lib/store";

export const Route = createFileRoute("/security")({
  head: () => ({
    meta: [
      { title: "Security & sessions — E-Registration Tracker" },
      { name: "description", content: "Review active sessions and 2-step settings." },
      { property: "og:title", content: "Security & sessions" },
      { property: "og:description", content: "Review active sessions and 2-step settings." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Security,
});

type S = {
  id: string;
  created_at: string;
  updated_at: string | null;
  user_agent: string | null;
  ip: string | null;
  aal: string | null;
};

function Security() {
  return (
    <DashboardGate>
      <SecurityContent />
    </DashboardGate>
  );
}

function SecurityContent() {
  const { L, user } = useApp();
  const [list, setList] = useState<S[]>([]);
  const [current, setCurrent] = useState("");
  const load = useCallback(async () => {
    const { data } = await supabase.rpc("list_my_sessions");
    setList((data ?? []) as S[]);
    const { data: s } = await supabase.auth.getSession();
    try {
      setCurrent(
        JSON.parse(
          atob(s.session!.access_token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")),
        ).session_id,
      );
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    if (user) void load();
  }, [user, load]);
  if (!user)
    return (
      <p className="py-20 text-center text-muted-foreground">{L("লগইন করুন", "Please sign in")}</p>
    );
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <section>
        <h1 className="mb-3 font-display text-2xl font-bold">
          {L("সক্রিয় সেশন", "Active sessions")}
        </h1>
        <div className="space-y-2">
          {list.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm"
            >
              <div className="flex-1">
                <div className="font-medium">
                  {s.user_agent?.slice(0, 80) ?? "—"}{" "}
                  {s.id === current && (
                    <span className="ml-1 rounded bg-success/15 px-2 text-success">
                      {L("এই ডিভাইস", "This device")}
                    </span>
                  )}
                </div>
                <div className="text-muted-foreground">
                  IP {s.ip ?? "—"} · {new Date(s.updated_at ?? s.created_at).toLocaleString()}
                </div>
              </div>
              {s.id !== current && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={async () => {
                    const { error } = await supabase.rpc("revoke_my_session", {
                      _session_id: s.id,
                    });
                    if (error) toast.error(error.message);
                    else {
                      toast.success(L("সেশন বন্ধ হয়েছে", "Session signed out"));
                      void load();
                    }
                  }}
                >
                  {L("সাইন আউট", "Sign out")}
                </Button>
              )}
            </div>
          ))}
        </div>
        <Button
          className="mt-3"
          variant="outline"
          onClick={async () => {
            await supabase.auth.signOut({ scope: "others" });
            void load();
            toast.success(L("অন্যান্য সব সেশন বন্ধ", "All other sessions signed out"));
          }}
        >
          {L("অন্য সব ডিভাইস থেকে সাইন আউট", "Sign out all other devices")}
        </Button>
      </section>
      {["admin", "uno", "super"].includes(user.role) && (
        <section>
          <h2 className="mb-3 font-display text-xl font-bold">
            {L("রিকভারি কোড", "Recovery codes")}
          </h2>
          <RecoveryCodes />
        </section>
      )}
    </div>
  );
}
