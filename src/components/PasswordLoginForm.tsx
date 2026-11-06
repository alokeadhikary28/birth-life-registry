import { useState, type FormEvent } from "react";
import { LogIn, Eye, EyeOff } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { passwordSignIn, requestPasswordReset } from "@/lib/auth.functions";
import { useApp } from "@/lib/store";

type LoginFailure = { error?: string; lockedMinutes?: number };
type Tokens = { access_token: string; refresh_token: string };

export function PasswordLoginForm({
  onAuthenticated,
  onFailure,
  onStart,
}: {
  onAuthenticated: (tokens: Tokens) => Promise<void>;
  onFailure: (result: LoginFailure) => void;
  onStart: () => void;
}) {
  const { L } = useApp();
  const signIn = useServerFn(passwordSignIn);
  const resetPassword = useServerFn(requestPasswordReset);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onStart();
    setBusy(true);
    try {
      const result = await signIn({ data: { email, password } });
      if (result.ok) {
        await onAuthenticated(result.tokens);
        setPassword("");
      } else {
        onFailure(result);
      }
    } catch (cause) {
      console.error("Password sign-in failed", cause);
      toast.error(
        L(
          "সেবা সাময়িকভাবে অনুপলব্ধ, পরে চেষ্টা করুন",
          "The service is temporarily unavailable; try again later",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const sendResetLink = async () => {
    if (!email.trim()) {
      toast.error(L("প্রথমে আপনার ইমেইল লিখুন", "Enter your email address first"));
      return;
    }
    setBusy(true);
    try {
      await resetPassword({ data: { email } });
      toast.success(
        L(
          "অ্যাকাউন্ট থাকলে একটি রিসেট লিংক পাঠানো হয়েছে (১ ঘণ্টা মেয়াদি)",
          "If the account exists, a reset link was sent (valid 1 hour)",
        ),
      );
    } catch (cause) {
      console.error("Password reset request failed", cause);
      toast.error(
        L(
          "রিসেট লিংক পাঠানো যায়নি, পরে আবার চেষ্টা করুন",
          "Could not send the reset link; please try again",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      onSubmit={(event) => void submit(event)}
    >
      <div className="flex items-center gap-2 text-slate-900">
        <LogIn className="h-5 w-5 text-blue-700" aria-hidden="true" />
        <h2 className="text-lg font-semibold">{L("লগইন করুন", "Log in")}</h2>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password-login-email">{L("ইমেইল (লগইন আইডি)", "Email (login ID)")}</Label>
        <Input
          id="password-login-email"
          type="email"
          autoComplete="username"
          placeholder="name@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          disabled={busy}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password-login-password">{L("পাসওয়ার্ড", "Password")}</Label>
        <div className="relative">
          <Input
            id="password-login-password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            className="pr-11"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            disabled={busy}
          />
          <button
            type="button"
            className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center rounded-r-md text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={
              showPassword
                ? L("পাসওয়ার্ড লুকান", "Hide password")
                : L("পাসওয়ার্ড দেখান", "Show password")
            }
            aria-pressed={showPassword}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button
          type="submit"
          className="w-full bg-blue-700 text-white hover:bg-blue-800"
          disabled={busy || !email.trim() || !password}
        >
          <LogIn className="mr-2 h-4 w-4" aria-hidden="true" />
          {busy ? L("লগইন হচ্ছে…", "Signing in…") : L("লগইন", "Login")}
        </Button>
        <Button
          type="button"
          className="w-full bg-amber-400 text-amber-950 hover:bg-amber-500"
          onClick={() => void sendResetLink()}
          disabled={busy || !email.trim()}
        >
          {L("রিসেট", "Reset")}
        </Button>
      </div>
    </form>
  );
}
