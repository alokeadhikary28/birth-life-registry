import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  BookOpen,
  Headphones,
  Languages,
  LogIn,
  LogOut,
  Moon,
  Sun,
  Landmark,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PasswordLoginForm } from "@/components/PasswordLoginForm";
import Register from "@/components/Register";

import { roleLabel, useApp } from "@/lib/store";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  sendPhoneOtp,
  verifyPhoneOtp,
} from "@/lib/auth.functions";

export function Header() {
  const {
    user,
    L,
    lang,
    toggleLang,
    dark,
    toggleTheme,
    logout,
    online,
    demoLoginAvailable,
  } = useApp();
  const [dlg, setDlg] = useState<null | "login" | "manual" | "support">(null);
  const nav = useNavigate();
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const updateHeight = () => {
      document.documentElement.style.setProperty(
        "--app-header-height",
        `${header.getBoundingClientRect().height}px`,
      );
    };
    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(header);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--app-header-height");
    };
  }, []);

  return (
    <header ref={headerRef} className="fixed inset-x-0 top-0 z-50 border-b border-slate-200 bg-white/95 text-slate-800 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 dark:text-slate-100">
      {!online && (
        <div className="flex items-center justify-center gap-2 bg-warning px-3 py-1 text-xs font-medium text-warning-foreground">
          <WifiOff className="h-3 w-3" /> {L("অফলাইন — তথ্য ডিভাইসে জমা থাকবে, অনলাইনে এলে স্বয়ংক্রিয়ভাবে সিঙ্ক হবে", "Offline — entries are cached and will auto-sync")}
        </div>
      )}
      <div className="mx-auto flex h-16 w-full max-w-none flex-nowrap items-center gap-1 px-2 sm:gap-2 sm:px-6 lg:px-8">
        <Link to="/" className="mr-auto flex shrink-0 items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-700 text-white"><Landmark className="h-5 w-5" /></span>
          <span className="leading-tight">
            <span className="block whitespace-nowrap font-display text-lg font-bold max-[480px]:hidden">{L("ই-নিবন্ধন ট্র্যাকার", "E-Registration Tracker")}</span>
            <span className="hidden whitespace-nowrap font-display text-sm font-bold max-[480px]:block max-[400px]:hidden">{L("ই-নিবন্ধন", "E-Register")}</span>
            <span className="hidden text-sm text-slate-500 dark:text-slate-400 sm:block">{L("জন্ম ও মৃত্যু নিবন্ধন · উপজেলা", "Birth & Death · Upazila")}</span>
          </span>
        </Link>
        <div className="ml-auto flex min-w-0 flex-nowrap items-center justify-end gap-1 sm:gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-11 shrink-0 bg-slate-100 px-3 text-base font-semibold text-slate-700 transition-colors hover:bg-emerald-50 hover:text-emerald-800 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-emerald-300 max-[400px]:h-9 max-[400px]:px-2 max-[400px]:text-sm sm:px-4"
            onClick={toggleLang}
            aria-label="Language"
          >
            <Languages className="h-6 w-6 max-[400px]:h-5 max-[400px]:w-5" />
            <span className="ml-1 max-[400px]:hidden">{lang === "bn" ? "EN" : "বাং"}</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0 bg-slate-100 text-slate-700 transition-colors hover:bg-emerald-50 hover:text-emerald-800 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-emerald-300 max-[400px]:h-9 max-[400px]:w-9"
            onClick={toggleTheme}
            aria-label="Theme"
          >
            {dark ? <Sun className="h-6 w-6 max-[400px]:h-5 max-[400px]:w-5" /> : <Moon className="h-6 w-6 max-[400px]:h-5 max-[400px]:w-5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0 bg-slate-100 text-slate-700 transition-colors hover:bg-emerald-50 hover:text-emerald-800 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-emerald-300 max-[400px]:h-9 max-[400px]:w-9"
            onClick={() => setDlg("manual")}
            aria-label="Manual"
          >
            <BookOpen className="h-6 w-6 max-[400px]:h-5 max-[400px]:w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0 bg-slate-100 text-slate-700 transition-colors hover:bg-emerald-50 hover:text-emerald-800 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-emerald-300 max-[400px]:h-9 max-[400px]:w-9"
            onClick={() => setDlg("support")}
            aria-label="Support"
          >
            <Headphones className="h-6 w-6 max-[400px]:h-5 max-[400px]:w-5" />
          </Button>
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 max-w-40 shrink-0 truncate border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 sm:px-4"
                >
                  {L(user.name.bn, user.name.en)}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  <div>{L(user.name.bn, user.name.en)}</div>
                  <div className="text-xs font-normal text-muted-foreground">{roleLabel(user.role, L)}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => nav({ to: "/dashboard" })}>{L("ড্যাশবোর্ড", "Dashboard")}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => nav({ to: "/security" })}>{L("নিরাপত্তা ও সেশন", "Security & sessions")}</DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    await logout();
                    nav({ to: "/", replace: true });
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  {L("লগআউট", "Logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : demoLoginAvailable ? (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200 sm:px-3 sm:text-xs">
              {L("লোকাল টেস্ট মোড", "Local test mode")}
            </span>
          ) : (
            <Button
              size="sm"
              className="h-11 shrink-0 bg-emerald-700 px-4 text-base font-bold text-white shadow-sm hover:bg-emerald-800 max-[400px]:h-9 max-[400px]:px-2 max-[400px]:text-sm"
              onClick={() => setDlg("login")}
            >
              <LogIn className="mr-2 h-6 w-6 max-[400px]:mr-0 max-[400px]:h-5 max-[400px]:w-5" />
              <span className="max-[360px]:sr-only">{L("লগইন", "Login")}</span>
            </Button>
          )}
        </div>
      </div>
      <LoginDialog open={dlg === "login"} onClose={() => setDlg(null)} />
      <ManualDialog open={dlg === "manual"} onClose={() => setDlg(null)} />
      <SupportDialog open={dlg === "support"} onClose={() => setDlg(null)} />
    </header>
  );
}

export function RoleSwitcherBar() {
  const { user, L, demoLoginAvailable, enterDemoLogin } = useApp();
  const nav = useNavigate();
  if (!demoLoginAvailable) return null;

  const roles = [
    ["worker", "স্বাস্থ্যকর্মী", "Health Worker"],
    ["police", "গ্রাম পুলিশ", "Village Police"],
    ["admin", "ইউপি প্রশাসনিক কর্মকর্তা", "UP Administrative Officer"],
    ["uno", "উপজেলা নির্বাহী অফিসার (ইউএনও)", "Upazila Nirbahi Officer (UNO)"],
  ] as const;

  return (
    <nav
      aria-label={L("লোকাল ডেমো রোল পরিবর্তন", "Local demo role switcher")}
      className="fixed bottom-3 right-3 z-50 w-56 rounded-xl border border-emerald-200 bg-background/95 p-2 shadow-lg backdrop-blur sm:bottom-5 sm:right-5"
    >
      <p className="px-1 pb-1.5 text-xs font-semibold text-muted-foreground">
        {L("রোল পরিবর্তন · টেস্ট মোড", "Switch role · Test mode")}
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {roles.map(([role, bn, en]) => (
          <Button
            key={role}
            type="button"
            size="sm"
            variant={user?.role === role && demoLoginAvailable ? "default" : "outline"}
            aria-pressed={user?.role === role && demoLoginAvailable}
            className="h-auto min-h-9 whitespace-normal px-1.5 py-1.5 text-xs"
            onClick={() => {
              enterDemoLogin(role);
              nav({ to: "/dashboard" });
            }}
          >
            {L(bn, en)}
          </Button>
        ))}
      </div>
    </nav>
  );
}

export function LoginDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { L, n, demoLoginAvailable, enterDemoLogin } = useApp();
  const nav = useNavigate();
  const sendOtp = useServerFn(sendPhoneOtp), verifyOtp = useServerFn(verifyPhoneOtp);
  const [mobile, setMobile] = useState(""); const [otp, setOtp] = useState(""); const [sent, setSent] = useState(false);

  const [loginMessage, setLoginMessage] = useState<"pending" | "rejected" | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = (r: { error?: string; lockedMinutes?: number }) => {
    if (r.error === "pending") {
      setLoginMessage("pending");
    } else if (r.error === "rejected") {
      setLoginMessage("rejected");
    } else if (r.error === "locked" || r.error === "too_many")
      toast.error(L(`অনেকবার চেষ্টা করা হয়েছে। ${n(r.lockedMinutes ?? 15)} মিনিট পর আবার চেষ্টা করুন`, `Too many attempts. Try again in ${r.lockedMinutes ?? 15} minutes`));
    else if (r.error === "bad_phone") toast.error(L("সঠিক মোবাইল নম্বর দিন (01XXXXXXXXX)", "Enter a valid mobile number (01XXXXXXXXX)"));
    else if (r.error === "sms_failed") toast.error(L("SMS পাঠানো যায়নি, পরে চেষ্টা করুন", "Could not send SMS, try later"));
    else toast.error(r.error === "unavailable"
      ? L("সেবা সাময়িকভাবে অনুপলব্ধ, পরে চেষ্টা করুন", "The service is temporarily unavailable; try again later")
      : L("তথ্য সঠিক নয়", "Details are incorrect"));
  };
  const done = async (tokens: { access_token: string; refresh_token: string }) => {
    const { error } = await supabase.auth.setSession(tokens);
    if (error) { toast.error(error.message); return; }
    onClose(); setSent(false); setOtp(""); nav({ to: "/dashboard" });
  };
  const enterLocalRolePreview = (role: "worker" | "police" | "admin" | "uno") => {
    enterDemoLogin(role);
    toast.info(L("ডেমো ড্যাশবোর্ড · পরিবর্তন শুধু এই ট্যাবে থাকবে", "Demo dashboard · changes stay in this tab"));
    onClose();
    nav({ to: "/dashboard" });
  };
  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    try {
      await f();
    } catch (cause) {
      console.error("Authentication operation failed", cause instanceof Error ? cause.message : "Unknown error");
      toast.error(L("সেবা সাময়িকভাবে অনুপলব্ধ, পরে চেষ্টা করুন", "The service is temporarily unavailable; try again later"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {L("লগইন বা নিবন্ধনের অনুরোধ", "Login or request registration")}
          </DialogTitle>
          <DialogDescription>
            {L(
              "বিদ্যমান অ্যাকাউন্টে লগইন করুন অথবা কর্মী হিসেবে নিবন্ধনের অনুরোধ পাঠান",
              "Sign in to an existing account or request staff registration",
            )}
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="login">
          <TabsList className="grid h-auto w-full grid-cols-2 rounded-xl border border-emerald-100 bg-emerald-50 p-1.5">
            <TabsTrigger
              className="h-12 text-lg font-bold text-emerald-900 data-[state=active]:bg-white data-[state=active]:text-emerald-800 data-[state=active]:shadow-md"
              value="login"
            >
              {L("লগইন", "Login")}
            </TabsTrigger>
            <TabsTrigger
              className="h-12 text-lg font-bold text-emerald-900 data-[state=active]:bg-white data-[state=active]:text-emerald-800 data-[state=active]:shadow-md"
              value="register"
            >
              {L("নিবন্ধন", "Register")}
            </TabsTrigger>
          </TabsList>
          {loginMessage && (
            <div
              className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
              role="status"
              aria-live="polite"
            >
              {loginMessage === "pending"
                ? L(
                    "Waiting for Approval — আপনার অ্যাকাউন্ট অনুমোদনের অপেক্ষায় আছে।",
                    "Waiting for Approval — your account is awaiting review.",
                  )
                : L("আপনার নিবন্ধন অনুমোদিত হয়নি।", "Your registration was not approved.")}
            </div>
          )}
          <TabsContent value="login" className="pt-2">
            <Tabs defaultValue="otp">
              <TabsList className="grid w-full grid-cols-2 rounded-lg border border-emerald-100 bg-emerald-50 p-1">
                <TabsTrigger
                  className="text-base font-semibold text-emerald-900 data-[state=active]:bg-white data-[state=active]:text-emerald-800 data-[state=active]:shadow-sm"
                  value="otp"
                >
                  {L("মোবাইল ও OTP", "Mobile & OTP")}
                </TabsTrigger>
                <TabsTrigger
                  className="text-base font-semibold text-emerald-900 data-[state=active]:bg-white data-[state=active]:text-emerald-800 data-[state=active]:shadow-sm"
                  value="pw"
                >
                  {L("পাসওয়ার্ড", "Password")}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="otp" className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">{L("স্বাস্থ্যকর্মী ও গ্রাম পুলিশের জন্য", "For Health Workers & Village Police")}</p>
            {demoLoginAvailable && (
              <p className="text-xs text-amber-800">
                {L("লোকাল প্রিভিউতে OTP পাঠানো বন্ধ। নিচে একটি ভূমিকা বেছে নিন।", "OTP is unavailable in local preview. Choose a role below.")}
              </p>
            )}
            <Label>{L("মোবাইল নম্বর", "Mobile number")}</Label>
            <Input className="border-slate-300 bg-slate-50 shadow-sm focus-visible:ring-emerald-700" inputMode="numeric" maxLength={11} value={mobile} disabled={sent} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))} placeholder="017XXXXXXXX" />
            {sent ? (<>
              <Label>{L("৬ অঙ্কের কোড", "6-digit code")}</Label>
              <Input className="border-slate-300 bg-slate-50 shadow-sm focus-visible:ring-emerald-700" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} />
              <Button className="w-full" disabled={busy || otp.length !== 6} onClick={() => run(async () => {
                const r = await verifyOtp({ data: { mobile, code: otp } }); if (r.ok) await done(r.tokens); else fail(r);
              })}>{L("যাচাই করুন", "Verify")}</Button>
              <button className="text-sm text-primary underline" onClick={() => { setSent(false); setOtp(""); }}>{L("নম্বর বদলান / আবার পাঠান", "Change number / resend")}</button>
            </>) : <>
              <Button className="w-full" disabled={demoLoginAvailable || busy || mobile.length !== 11} onClick={() => {
                void run(async () => {
                  setLoginMessage(null);
                  const r = await sendOtp({ data: { mobile } });
                  if (r.ok) {
                    setSent(true);
                    toast.success(L("নিবন্ধিত হলে আপনার মোবাইলে কোড পাঠানো হয়েছে", "If registered, a code was sent to your mobile"));
                  } else {
                    fail(r);
                  }
                });
              }}>{L("OTP পাঠান", "Send OTP")}</Button>
              {demoLoginAvailable && (
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ["worker", "স্বাস্থ্যকর্মী ড্যাশবোর্ড"],
                    ["police", "গ্রাম পুলিশ ড্যাশবোর্ড"],
                    ["admin", "ইউপি কর্মকর্তা ড্যাশবোর্ড"],
                    ["uno", "ইউএনও ড্যাশবোর্ড"],
                  ] as const).map(([role, label]) => (
                    <Button key={role} type="button" variant="outline" className="h-auto min-h-10 whitespace-normal px-2 py-2 text-xs"
                      onClick={() => enterLocalRolePreview(role)}>
                      {label}
                    </Button>
                  ))}
                </div>
              )}
            </>}
              </TabsContent>
              <TabsContent value="pw" className="space-y-3 pt-2">
                <p className="text-xs text-muted-foreground">{L("অনুমোদিত কর্মীরা ইমেইল ও পাসওয়ার্ড দিয়ে লগইন করুন", "Approved staff can sign in with email and password")}</p>
                <PasswordLoginForm
                  onAuthenticated={done}
                  onFailure={fail}
                  onStart={() => setLoginMessage(null)}
                />
              </TabsContent>

            </Tabs>
          </TabsContent>
          <TabsContent value="register" className="space-y-3 pt-2">
            <Register />
          </TabsContent>
        </Tabs>
        {demoLoginAvailable && (
          <p className="border-t border-dashed pt-3 text-xs text-amber-800">
            {L(
              "শুধু লোকাল UI পরীক্ষার জন্য · কোনো বাস্তব অ্যাকাউন্ট বা সেশন তৈরি হয় না",
              "Local UI preview only · no real account or session is created",
            )}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ManualDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { L } = useApp();
  const steps: [string, string[]][] = [
    [L("ইপিআই / স্বাস্থ্যকর্মী", "EPI / Health Worker"), [
      L("মোবাইল ও OTP দিয়ে লগইন করুন", "Log in with mobile & OTP"),
      L("জন্ম বা মৃত্যু ফর্ম বেছে নিন, বাংলা ও ইংরেজি ঘর পূরণ করুন", "Pick birth/death form, fill Bangla & English boxes"),
      L("শুধু গ্রাম বেছে নিন — বাকি ঠিকানা নিজে বসে যাবে", "Pick the village only — the rest of the address fills itself"),
      L("৩টি পর্যন্ত কাগজ যুক্ত করে জমা দিন; অফলাইনেও কাজ করে", "Attach up to 3 documents and submit; works offline"),
    ]],
    [L("প্রশাসনিক কর্মকর্তা", "Administrative Officer"), [
      L("ইউনিয়নের সব আবেদন দেখুন, মন্তব্য ও অবস্থা হালনাগাদ করুন", "Review union cases, add remarks, update status"),
      L("গ্রাম পুলিশকে যাচাইয়ের কাজ দিন", "Assign verification to Village Police"),
      L("নিবন্ধন নম্বর দিয়ে কেস সম্পন্ন করুন", "Close cases with the registration number"),
    ]],
    [L("গ্রাম পুলিশ", "Village Police"), [
      L("নির্ধারিত বাড়ির তালিকা দেখুন", "See assigned houses"),
      L("কাগজ সংগ্রহের চেকলিস্ট টিক দিন ও 'সংগ্রহ সম্পন্ন' চাপুন", "Tick the checklist and tap 'Documents Collected'"),
    ]],
    [L("ইউএনও", "UNO"), [
      L("সব ইউনিয়নের লক্ষ্যমাত্রা গ্রাফে দেখুন", "Track all unions against targets"),
      L("লাল চিহ্নিত নিষ্ক্রিয় এলাকা দেখুন ও ইউএনও মন্তব্য দিন", "Watch red-flagged areas, add UNO remarks"),
      L("মাস্টার রিপোর্ট ডাউনলোড করুন", "Download the master report"),
    ]],
  ];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>{L("ব্যবহার নির্দেশিকা", "User Manual")}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {steps.map(([role, list]) => (
            <div key={role}>
              <h3 className="mb-1 font-semibold text-primary">{role}</h3>
              <ol className="list-decimal space-y-1 pl-5 text-sm">{list.map((s) => <li key={s}>{s}</li>)}</ol>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SupportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { L } = useApp();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{L("সহায়তা কেন্দ্র", "Contact Support")}</DialogTitle>
          <DialogDescription>{L("উপজেলা আইসিটি / প্রশাসনিক সহায়তা দল", "Upazila ICT / Administrative support team")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Button asChild variant="outline"><a href="tel:+8801700000000">📞 {L("কল করুন", "Call")} +880 1700-000000</a></Button>
          <Button asChild variant="outline"><a href="mailto:ict@upazila.gov.bd">✉️ ict@upazila.gov.bd</a></Button>
          <Button asChild variant="outline"><a href="https://wa.me/8801700000000" target="_blank" rel="noreferrer">💬 WhatsApp</a></Button>
          <p className="text-xs text-muted-foreground">{L("অফিস সময়: রবি–বৃহস্পতি, সকাল ৯টা – বিকাল ৫টা", "Office hours: Sun–Thu, 9 AM – 5 PM")}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
