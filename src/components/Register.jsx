import { useState, useEffect } from "react";
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
import { EXECUTIVE_POSITIONS } from "@/lib/dashboard-roles";
import { MONIRAMPUR_STATIONS } from "@/lib/monirampur-stations";
import { useApp } from "@/lib/store";

const EXECUTIVE_CATEGORY = "উচ্চ পর্যায়ের নির্বাহী প্যানেল";
const fieldClassName =
  "border-slate-300 bg-slate-50 shadow-sm focus-visible:ring-emerald-700";

const initialForm = {
  fullName: "",
  email: "",
  mobile: "",
  officeName: "",
  category: "স্বাস্থ্যকর্মী",
  requestedPosition: "",
  jurisdictionId: "",
};

export default function Register() {
  const { L } = useApp();
  const submitRequest = useServerFn(submitStaffRegistrationRequest);
  const [formData, setFormData] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  // ১. শতভাগ ক্লায়েন্ট-সাইড রেন্ডারিং নিশ্চিত করার জন্য স্টেট
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const updateField = (field, value) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const getJurisdictionLabel = () => {
    if (formData.category !== EXECUTIVE_CATEGORY) {
      return { bn: "ইউনিয়ন", en: "Union" };
    }
    
    switch (formData.requestedPosition) {
      case "uno":
        return { bn: "উপজেলা", en: "Upazila" };
      case "dc":
      case "ddlg":
      case "addl_reg_gen":
      case "reg_gen":
        return { bn: "জেলা", en: "District" };
      case "div_comm":
        return { bn: "বিভাগ", en: "Division" };
      case "muni_exec":
        return { bn: "পৌরসভা", en: "Municipality" };
      case "city_ceo":
        return { bn: "সিটি কর্পোরেশন", en: "City Corporation" };
      default:
        return { bn: "প্রশাসনিক এলাকা", en: "Jurisdiction Area" };
    }
  };

  const jurisdictionLabel = getJurisdictionLabel();

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
          requestedPosition: formData.requestedPosition || undefined,
          unionId: formData.category !== EXECUTIVE_CATEGORY ? formData.jurisdictionId : undefined,
          jurisdictionId: formData.category === EXECUTIVE_CATEGORY ? formData.jurisdictionId : undefined,
        },
      });

      if (!result.ok) {
        const text =
          result.error === "bad_phone"
            ? L("সঠিক মোবাইল নম্বর দিন (01XXXXXXXXX)", "Enter a valid mobile number (01XXXXXXXXX)")
            : result.error === "bad_union" || result.error === "bad_jurisdiction"
              ? L("সঠিক এলাকা বেছে নিন", "Select a valid jurisdiction")
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

  // ২. সার্ভার সাইডে রেন্ডার হওয়ার সময় একদম খালি অংশ রিটার্ন করা যাতে হাইড্রেশন মিসম্যাচ না ঘটে
  if (!isClient) {
    return <div className="py-8 text-center text-muted-foreground">লোড হচ্ছে...</div>;
  }

  return (
    <form className="space-y-4" onSubmit={(event) => void submit(event)}>
      <p className="text-lg leading-7 text-muted-foreground">
        {L(
          "নাম, ইমেইল, ভূমিকা ও এলাকা দিয়ে আবেদন করুন। এটি শুধু অনুমোদনের অনুরোধ—এখনই কোনো অ্যাকাউন্ট তৈরি হবে না।",
          "Apply with your name, email, role, and jurisdiction. This submits an approval request; it does not create an account.",
        )}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-lg" htmlFor="registration-full-name">
            {L("পূর্ণ নাম", "Full name")}
          </Label>
          <Input
            className={`h-11 text-lg md:text-lg ${fieldClassName}`}
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
          <Label className="text-lg" htmlFor="registration-email">
            {L("ইমেইল", "Email")}
          </Label>
          <Input
            className={`h-11 text-lg md:text-lg ${fieldClassName}`}
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
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-lg" htmlFor="registration-mobile">
            {L("মোবাইল নম্বর (ঐচ্ছিক)", "Mobile number (optional)")}
          </Label>
          <Input
            className={`h-11 text-lg md:text-lg ${fieldClassName}`}
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
          <Label className="text-lg" htmlFor="registration-office-name">
            {L("অফিসের নাম", "Office name")}
          </Label>
          <Input
            className={`h-11 text-lg md:text-lg ${fieldClassName}`}
            id="registration-office-name"
            autoComplete="organization"
            maxLength={120}
            value={formData.officeName}
            onChange={(event) => updateField("officeName", event.target.value)}
            required
            disabled={loading}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-lg" htmlFor="registration-category">
            {L("যে ভূমিকার জন্য আবেদন", "Role requested")}
          </Label>
          <Select
            value={formData.category}
            onValueChange={(value) => {
              setFormData((current) => ({
                ...current,
                category: value,
                requestedPosition: "",
                jurisdictionId: "",
              }));
            }}
            disabled={loading}
          >
            <SelectTrigger
              className={`h-11 text-lg ${fieldClassName}`}
              id="registration-category"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem className="text-lg" value="স্বাস্থ্যকর্মী">{L("স্বাস্থ্যকর্মী", "Health Worker")}</SelectItem>
              <SelectItem className="text-lg" value="গ্রাম পুলিশ">{L("গ্রাম পুলিশ", "Gram Police")}</SelectItem>
              <SelectItem className="text-lg" value="ইউপি প্রশাসনিক কর্মকর্তা">
                {L("ইউপি প্রশাসনিক কর্মকর্তা", "UP Administrative Officer")}
              </SelectItem>
              <SelectItem className="text-lg" value={EXECUTIVE_CATEGORY}>
                {L(EXECUTIVE_CATEGORY, "Higher-Level Executive Panel")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {formData.category === EXECUTIVE_CATEGORY && (
          <div className="space-y-1.5">
            <Label className="text-lg" htmlFor="registration-position">
              {L("পদবি", "Position")}
            </Label>
            <Select
              value={formData.requestedPosition}
              onValueChange={(value) => {
                updateField("requestedPosition", value);
                updateField("jurisdictionId", "");
              }}
              disabled={loading}
            >
              <SelectTrigger
                className={`h-11 text-lg ${fieldClassName}`}
                id="registration-position"
              >
                <SelectValue placeholder={L("পদবি বেছে নিন", "Select a position")} />
              </SelectTrigger>
              <SelectContent>
                {EXECUTIVE_POSITIONS.map((position) => (
                  <SelectItem className="text-lg" key={position.role} value={position.role}>
                    {L(position.bn, position.en)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-lg" htmlFor="registration-jurisdiction">
          {L(jurisdictionLabel.bn, jurisdictionLabel.en)}
        </Label>
        <Select
          value={formData.jurisdictionId}
          onValueChange={(value) => updateField("jurisdictionId", value)}
          disabled={loading || (formData.category === EXECUTIVE_CATEGORY && !formData.requestedPosition)}
        >
          <SelectTrigger
            className={`h-11 text-lg ${fieldClassName}`}
            id="registration-jurisdiction"
          >
            <SelectValue placeholder={L("এলাকা বেছে নিন", "Select jurisdiction")} />
          </SelectTrigger>
          <SelectContent>
            {formData.category !== EXECUTIVE_CATEGORY ? (
              MONIRAMPUR_STATIONS.filter((station) => station.type === "union").map((station) => (
                <SelectItem className="text-lg" key={station.id} value={station.id}>
                  {L(station.bn, station.en)}
                </SelectItem>
              ))
            ) : (
              <>
                <SelectItem className="text-lg" value="manirampur_upazila">মণিরামপুর উপজেলা</SelectItem>
                <SelectItem className="text-lg" value="jashore_district">যশোর জেলা</SelectItem>
                <SelectItem className="text-lg" value="khulna_division">খুলনা বিভাগ</SelectItem>
                <SelectItem className="text-lg" value="manirampur_paurasabha">মণিরামপুর পৌরসভা</SelectItem>
              </>
            )}
          </SelectContent>
        </Select>
      </div>

      {message && (
        <p
          className={`rounded-lg border p-3 text-base ${
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
        className="h-12 w-full text-lg"
        disabled={
          loading ||
          !formData.fullName.trim() ||
          !formData.email.trim() ||
          !formData.jurisdictionId ||
          !formData.officeName.trim() ||
          (formData.category === EXECUTIVE_CATEGORY && !formData.requestedPosition)
        }
      >
        {loading
          ? L("জমা হচ্ছে…", "Submitting…")
          : L("নিবন্ধনের অনুরোধ পাঠান", "Submit registration request")}
      </Button>
    </form>
  );
}