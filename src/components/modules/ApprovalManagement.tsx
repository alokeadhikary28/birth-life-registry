import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, RefreshCw, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModuleNavigation } from "./ModuleNavigation";
import { PageTitle } from "@/components/shared";
import { useServerFn } from "@tanstack/react-start";
import { createStaff, listPendingStaff, reviewStaffRegistration } from "@/lib/auth.functions";
import { useApp } from "@/lib/store";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Applicant = {
  id: string;
  nameBn: string;
  nameEn: string;
  email: string | null;
  mobile: string | null;
  role: "worker" | "police" | "admin";
  createdAt: string;
};

type StaffRole = "worker" | "police" | "admin";

function roleName(role: Applicant["role"], L: (bn: string, en: string) => string) {
  if (role === "worker") return L("স্বাস্থ্যকর্মী", "Health Worker");
  if (role === "police") return L("গ্রাম পুলিশ", "Gram Police");
  return L("ইউপি প্রশাসনিক কর্মকর্তা", "UP Administrative Officer");
}

export function ApprovalManagement() {
  const { L, user, state, refresh } = useApp();
  const loadApplicants = useServerFn(listPendingStaff);
  const review = useServerFn(reviewStaffRegistration);
  const provision = useServerFn(createStaff);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [nameBn, setNameBn] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [contact, setContact] = useState("");
  const [unionId, setUnionId] = useState(user?.role === "admin" ? user.stationId ?? user.unionId ?? "" : "");
  const [ward, setWard] = useState(1);
  const [role, setRole] = useState<StaffRole>(user?.role === "uno" ? "admin" : "worker");
  const isAdmin = user?.role === "admin";
  const upazila = state.upazilas.find((item) => item.id === user?.upazilaId);
  const assignableRoles: StaffRole[] = user?.role === "uno" ? ["admin", "worker", "police"] : [];
  const targetUnion = unionId;

  const refreshApplicants = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await loadApplicants();
      if (!result.ok) {
        setError(true);
        setApplicants([]);
        toast.error(
          result.error === "mfa_required"
            ? L("অনুমোদন পর্যালোচনার জন্য MFA যাচাই করুন", "Verify MFA to review registrations")
            : result.error === "forbidden"
              ? L("এই পাতায় প্রবেশের অনুমতি নেই", "You don't have access to this page")
              : L("নিবন্ধনের তালিকা লোড করা যায়নি", "Could not load pending registrations"),
        );
      } else {
        setApplicants(result.applicants);
      }
    } catch (cause) {
      console.error("Could not load pending registrations", cause);
      setApplicants([]);
      setError(true);
      toast.error(L("নিবন্ধনের তালিকা লোড করা যায়নি", "Could not load pending registrations"));
    } finally {
      setLoading(false);
    }
  }, [L, loadApplicants]);

  useEffect(() => {
    void refreshApplicants();
  }, [refreshApplicants]);

  const createRegistration = async () => {
    if (!user || !upazila || !targetUnion || !nameBn.trim() || !contact.trim()) {
      toast.error(L("নাম, যোগাযোগের তথ্য ও ইউনিয়ন পূরণ করুন", "Enter a name, contact, and union"));
      return;
    }
    if (
      (role === "worker" || role === "police") &&
      (!Number.isInteger(ward) || ward < 1 || ward > 9)
    ) {
      toast.error(L("১ থেকে ৯-এর মধ্যে ওয়ার্ড নম্বর দিন", "Enter a ward number between 1 and 9"));
      return;
    }
    setCreating(true);
    try {
      const result = await provision({
        data: {
          role,
          nameBn: nameBn.trim(),
          nameEn: nameEn.trim() || nameBn.trim(),
          contact: contact.trim(),
          upazilaId: upazila.id,
          unionId: targetUnion,
          ...(role === "worker" || role === "police" ? { ward } : {}),
        },
      });
      if (!result.ok) {
        toast.error(
          result.error === "mfa_required"
            ? L("অ্যাকাউন্ট তৈরির জন্য MFA যাচাই করুন", "Verify MFA to create an account")
            : result.error === "forbidden"
              ? L("এই ভূমিকা বা এলাকায় অ্যাকাউন্ট তৈরির অনুমতি নেই", "You cannot create this role or area account")
              : result.error === "bad_phone"
                ? L("সঠিক মোবাইল নম্বর দিন", "Enter a valid mobile number")
                : result.error === "bad_email"
                  ? L("সঠিক ইমেইল ঠিকানা দিন", "Enter a valid email address")
                  : result.error === "bad_union" || result.error === "union_required"
                    ? L("বৈধ ইউনিয়ন নির্বাচন করুন", "Select a valid union")
                    : L("অ্যাকাউন্ট তৈরি করা যায়নি", "Could not create the account"),
        );
        return;
      }
      toast.success(
        result.approvalStatus === "approved"
          ? L("অ্যাকাউন্ট তৈরি ও সক্রিয় হয়েছে", "Account created and activated")
          : L("অ্যাকাউন্ট তৈরি হয়েছে; অনুমোদনের অপেক্ষায় আছে", "Account created and is awaiting approval"),
      );
      if (result.warning === "audit_failed") {
        toast.error(L("অ্যাকাউন্ট তৈরি হয়েছে, তবে অডিট লগ সংরক্ষণ হয়নি", "Account created, but audit logging failed"));
      }
      setNameBn("");
      setNameEn("");
      setContact("");
      if (!isAdmin) setUnionId("");
      await refreshApplicants();
      await refresh();
    } catch (cause) {
      console.error("Could not create staff account", cause);
      toast.error(L("অ্যাকাউন্ট তৈরি করা যায়নি", "Could not create the account"));
    } finally {
      setCreating(false);
    }
  };

  const decide = async (applicant: Applicant, decision: "approve" | "reject") => {
    setBusyId(applicant.id);
    try {
      const result = await review({ data: { userId: applicant.id, decision } });
      if (!result.ok) {
        toast.error(
          result.error === "not_pending_or_forbidden"
            ? L("এই আবেদনটি আর অপেক্ষমাণ নেই বা আপনার এলাকার নয়", "This registration is no longer pending or outside your jurisdiction")
            : result.error === "mfa_required"
              ? L("অনুমোদন পরিবর্তনের জন্য MFA যাচাই করুন", "Verify MFA to change approval status")
              : L("নিবন্ধনের অবস্থা হালনাগাদ করা যায়নি", "Could not update registration status"),
        );
      } else {
        setApplicants((current) => current.filter((item) => item.id !== applicant.id));
        toast.success(
          decision === "approve"
            ? L("ব্যবহারকারী অনুমোদিত হয়েছে", "User approved")
            : L("নিবন্ধন প্রত্যাখ্যান করা হয়েছে", "Registration rejected"),
        );
        if (result.warning === "audit_failed") {
          toast.error(L("অবস্থা পরিবর্তিত হয়েছে, তবে নিরীক্ষা লগ সংরক্ষণ হয়নি", "Status changed, but audit logging failed"));
        }
      }
    } catch (cause) {
      console.error("Could not update staff approval status", cause);
      toast.error(L("নিবন্ধনের অবস্থা হালনাগাদ করা যায়নি", "Could not update registration status"));
      void refreshApplicants();
    } finally {
      setBusyId(null);
    }
  };

  const areaLabel = isAdmin
    ? L("আপনার ইউনিয়নের স্বাস্থ্যকর্মী ও গ্রাম পুলিশের নিবন্ধন অনুমোদন করুন", "Review Health Worker and Gram Police registrations in your union")
    : L("আপনার উপজেলার কর্মীদের অ্যাকাউন্ট তৈরি ও ইউপি প্রশাসনিক কর্মকর্তার নিবন্ধন অনুমোদন করুন", "Create staff accounts and review UP Administrative Officer registrations in your upazila");

  return (
    <main className="mx-auto w-full max-w-none px-4 py-6 sm:px-6 lg:px-8">
      <ModuleNavigation />
      <PageTitle
        title={L("অনুমোদন ব্যবস্থাপনা", "Approval Management")}
        sub={areaLabel}
        actions={
          <Button variant="outline" onClick={() => void refreshApplicants()} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {L("হালনাগাদ", "Refresh")}
          </Button>
        }
      />

      {user?.role === "uno" && <section className="mb-6 space-y-3 rounded-xl border border-emerald-200 bg-card p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <UserPlus className="h-4 w-4" />
          {L("নতুন কর্মী অ্যাকাউন্ট তৈরি", "Create staff account")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="approval-name-bn">{L("নাম (বাংলা)", "Name (Bangla)")}</Label>
            <Input id="approval-name-bn" value={nameBn} onChange={(event) => setNameBn(event.target.value)} maxLength={100} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="approval-name-en">{L("নাম (ইংরেজি)", "Name (English)")}</Label>
            <Input id="approval-name-en" value={nameEn} onChange={(event) => setNameEn(event.target.value)} maxLength={100} />
          </div>
          <div className="space-y-1">
            <Label>{L("ভূমিকা", "Role")}</Label>
            <Select value={role} onValueChange={(value) => {
              if (assignableRoles.includes(value as StaffRole)) setRole(value as StaffRole);
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {assignableRoles.map((item) => (
                  <SelectItem key={item} value={item}>{roleName(item, L)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="approval-contact">{role === "admin" ? L("ইমেইল", "Email") : L("মোবাইল নম্বর", "Mobile number")}</Label>
            <Input
              id="approval-contact"
              type={role === "admin" ? "email" : "tel"}
              autoComplete={role === "admin" ? "email" : "tel"}
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              maxLength={255}
            />
          </div>
          <div className="space-y-1">
            <Label>{L("ইউনিয়ন", "Union")}</Label>
            <Select value={unionId} onValueChange={setUnionId}>
              <SelectTrigger><SelectValue placeholder={L("ইউনিয়ন বেছে নিন", "Select a union")} /></SelectTrigger>
              <SelectContent>
                {upazila?.unions.map((item) => (
                  <SelectItem key={item.id} value={item.id}>{L(item.bn, item.en)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(role === "worker" || role === "police") && (
            <div className="space-y-1">
              <Label htmlFor="approval-ward">{L("ওয়ার্ড", "Ward")}</Label>
              <Input
                id="approval-ward"
                type="number"
                min={1}
                max={9}
                value={ward}
                onChange={(event) => setWard(Number(event.target.value))}
              />
            </div>
          )}
        </div>
        <Button
          type="button"
          disabled={
            creating ||
            !nameBn.trim() ||
            !contact.trim() ||
            !targetUnion ||
            ((role === "worker" || role === "police") && (!Number.isInteger(ward) || ward < 1 || ward > 9))
          }
          onClick={() => void createRegistration()}
        >
          {creating ? L("তৈরি হচ্ছে…", "Creating…") : L("অনুমোদনের জন্য অ্যাকাউন্ট তৈরি", "Create account for approval")}
        </Button>
      </section>}

      {loading ? (
        <p className="py-12 text-center text-muted-foreground" role="status">
          {L("নিবন্ধনের তালিকা লোড হচ্ছে…", "Loading registrations…")}
        </p>
      ) : error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 text-center">
          <p className="mb-3 text-sm text-muted-foreground">
            {L("নিবন্ধনের তালিকা পাওয়া যায়নি। আবার চেষ্টা করুন।", "The registration list is unavailable. Please try again.")}
          </p>
          <Button variant="outline" onClick={() => void refreshApplicants()}>{L("আবার চেষ্টা করুন", "Try again")}</Button>
        </div>
      ) : applicants.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
          {isAdmin
            ? L("আপনার ইউনিয়নে অপেক্ষমাণ স্বাস্থ্যকর্মী বা গ্রাম পুলিশ নেই", "No Health Worker or Gram Police accounts are awaiting approval in your union")
            : L("আপনার উপজেলায় অপেক্ষমাণ ইউপি প্রশাসনিক কর্মকর্তা নেই", "No UP Administrative Officer accounts are awaiting approval in your upazila")}
        </div>
      ) : (
        <div className="space-y-3">
          {applicants.map((applicant) => (
            <article key={applicant.id} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="font-semibold">{applicant.nameEn || applicant.nameBn}</h2>
                {applicant.nameBn && applicant.nameBn !== applicant.nameEn && (
                  <p className="text-sm text-muted-foreground">{applicant.nameBn}</p>
                )}
                <p className="text-sm text-muted-foreground">{roleName(applicant.role, L)}</p>
                <p className="break-all text-sm">{applicant.email ?? applicant.mobile}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {L("আবেদনের তারিখ", "Submitted")} · {new Date(applicant.createdAt).toLocaleDateString(L("bn-BD", "en-US"))}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button disabled={busyId !== null} onClick={() => void decide(applicant, "approve")}>
                  <Check className="mr-1 h-4 w-4" />{L("অনুমোদন", "Approve")}
                </Button>
                <Button variant="destructive" disabled={busyId !== null} onClick={() => void decide(applicant, "reject")}>
                  <X className="mr-1 h-4 w-4" />{L("প্রত্যাখ্যান", "Reject")}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
