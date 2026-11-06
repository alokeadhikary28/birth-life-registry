import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { submitStaffRegistrationRequest } from "@/lib/auth.functions";
import { MONIRAMPUR_STATIONS } from "@/lib/monirampur-stations";
import { useApp } from "@/lib/store";

const initialForm = {
  fullName: "",
  email: "",
  mobile: "",
  officeName: "",
  category: "স্বাস্থ্যকর্মী",
  unionId: "",
};

export default function Register() {
  const { L } = useApp();
  const submitRequest = useServerFn(submitStaffRegistrationRequest);
  const [formData, setFormData] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const updateField = (field, value) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const result = await submitRequest({
        data: {
          fullName: formData.fullName.trim(),
          email: formData.email.trim(),
          mobile: formData.mobile.trim() || undefined,
          officeName: formData.officeName.trim(),
          category: formData.category,
          unionId: formData.unionId,
        },
      });

      if (!result.ok) {
        const text =
          result.error === "bad_phone"
            ? L("সঠিক মোবাইল নম্বর দিন (01XXXXXXXXX)", "Enter a valid mobile number (01XXXXXXXXX)")
            : result.error === "bad_union"
              ? L("সঠিক ইউনিয়ন বেছে নিন", "Select a valid union")
              : result.error === "duplicate"
                ? L(
                    "এই ইমেইল দিয়ে একটি অনুরোধ ইতিমধ্যে জমা হয়েছে",
                    "A request with this email has already been submitted",
                  )
                : result.error === "too_many"
                  ? L(
                      "অনেকবার অনুরোধ করা হয়েছে। পরে আবার চেষ্টা করুন",
                      "Too many requests. Please try again later",
                    )
                  : L(
                      "অনুরোধ জমা দেওয়া যায়নি। পরে আবার চেষ্টা করুন",
                      "Could not submit the request. Please try again later",
                    );
        setMessage({ type: "error", text });
        return;
      }

      setFormData(initialForm);
      setMessage({
        type: "success",
        text: L(
          "আপনার অনুরোধ সুপার অ্যাডমিনের কাছে জমা হয়েছে। অনুমোদনের পর ইমেইলে পাসওয়ার্ড সেট করার লিংক পাবেন।",
          "Your request was submitted to the Super Admin. After approval, you’ll receive an email link to set your password.",
        ),
      });
    } catch (error) {
      console.error("Could not submit staff registration request", error);
      setMessage({
        type: "error",
        text: L(
          "অনুরোধ জমা দেওয়া যায়নি। পরে আবার চেষ্টা করুন",
          "Could not submit the request. Please try again later",
        ),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={(event) => void submit(event)}>
      <p className="text-sm leading-6 text-muted-foreground">
        {L(
          "নাম, ইমেইল, ভূমিকা ও ইউনিয়ন দিয়ে আবেদন করুন। এটি শুধু অনুমোদনের অনুরোধ—এখনই কোনো অ্যাকাউন্ট তৈরি হবে না।",
          "Apply with your name, email, role, and union. This submits an approval request; it does not create an account.",
        )}
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="registration-full-name">{L("পূর্ণ নাম", "Full name")}</Label>
        <Input
          id="registration-full-name"
          autoComplete="name"
          maxLength={100}
          value={formData.fullName}
          onChange={(event) => updateField("fullName", event.target.value)}
          required
          disabled={loading}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="registration-email">{L("ইমেইল", "Email")}</Label>
        <Input
          id="registration-email"
          type="email"
          autoComplete="email"
          maxLength={255}
          placeholder="name@example.com"
          value={formData.email}
          onChange={(event) => updateField("email", event.target.value)}
          required
          disabled={loading}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="registration-mobile">
          {L("মোবাইল নম্বর (ঐচ্ছিক)", "Mobile number (optional)")}
        </Label>
        <Input
          id="registration-mobile"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={20}
          placeholder="017XXXXXXXX"
          value={formData.mobile}
          onChange={(event) => updateField("mobile", event.target.value)}
          disabled={loading}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="registration-office-name">{L("অফিসের নাম", "Office name")}</Label>
        <Input
          id="registration-office-name"
          autoComplete="organization"
          maxLength={120}
          value={formData.officeName}
          onChange={(event) => updateField("officeName", event.target.value)}
          required
          disabled={loading}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="registration-category">
            {L("যে ভূমিকার জন্য আবেদন", "Role requested")}
          </Label>
          <Select
            value={formData.category}
            onValueChange={(value) => {
              updateField("category", value);
            }}
            disabled={loading}
          >
            <SelectTrigger id="registration-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="স্বাস্থ্যকর্মী">{L("স্বাস্থ্যকর্মী", "Health Worker")}</SelectItem>
              <SelectItem value="গ্রাম পুলিশ">{L("গ্রাম পুলিশ", "Gram Police")}</SelectItem>
              <SelectItem value="ইউপি প্রশাসনিক কর্মকর্তা">
                {L("ইউপি প্রশাসনিক কর্মকর্তা", "UP Administrative Officer")}
              </SelectItem>
              <SelectItem value="উচ্চপর্যায়ের নির্বাহী প্যানেল">
                {L("উচ্চপর্যায়ের নির্বাহী প্যানেল", "Executive Panel")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="registration-union">{L("ইউনিয়ন", "Union")}</Label>
          <Select
            value={formData.unionId}
            onValueChange={(value) => updateField("unionId", value)}
            disabled={loading}
          >
            <SelectTrigger id="registration-union">
              <SelectValue placeholder={L("ইউনিয়ন বেছে নিন", "Select your union")} />
            </SelectTrigger>
            <SelectContent>
              {MONIRAMPUR_STATIONS.filter((station) => station.type === "union").map((station) => (
                <SelectItem key={station.id} value={station.id}>
                  {L(station.bn, station.en)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {message && (
        <p
          className={`rounded-lg border p-3 text-sm ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-destructive/30 bg-destructive/5 text-destructive"
          }`}
          role={message.type === "success" ? "status" : "alert"}
          aria-live="polite"
        >
          {message.text}
        </p>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={
          loading ||
          !formData.fullName.trim() ||
          !formData.email.trim() ||
          !formData.unionId ||
          !formData.officeName.trim()
        }
      >
        {loading
          ? L("জমা হচ্ছে…", "Submitting…")
          : L("নিবন্ধনের অনুরোধ পাঠান", "Submit registration request")}
      </Button>
    </form>
  );
}
