import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PENDING_APPROVALS_CHANGED_EVENT } from "./ModuleNavigation";
import { PageTitle } from "@/components/shared";
import { useServerFn } from "@tanstack/react-start";
import {
  createStaff,
  listPendingStaff,
  rejectStaffRegistrationRequest,
  reviewStaffRegistration,
} from "@/lib/auth.functions";
import { EXECUTIVE_POSITIONS, type ExecutivePreviewRole } from "@/lib/dashboard-roles";
import { useApp } from "@/lib/store";

type StaffRole = "worker" | "police" | "admin" | "uno" | "district" | "super";
type RegistrationCategory =
  "স্বাস্থ্যকর্মী" | "গ্রাম পুলিশ" | "ইউপি প্রশাসনিক কর্মকর্তা" | "উচ্চ পর্যায়ের নির্বাহী প্যানেল";

type Applicant = {
  id: string;
  nameBn: string;
  nameEn: string;
  email: string | null;
  mobile: string | null;
  role: StaffRole;

  createdAt: string;
};

type RegistrationRequest = {
  id: string;
  fullName: string;
  email: string | null;
  mobile: string | null;
  role: StaffRole;
  category: RegistrationCategory;
  requestedPosition: ExecutivePreviewRole | null;
  upazilaId: string;

  unionId: string | null;
  jurisdictionId: string | null;
  unionName: string;
  createdAt: string;
};

function notifyPendingApprovalCountChanged() {
  window.dispatchEvent(new Event(PENDING_APPROVALS_CHANGED_EVENT));
}

function roleName(role: StaffRole, L: (bn: string, en: string) => string) {
  if (role === "worker") return L("স্বাস্থ্যকর্মী", "Health Worker");
  if (role === "police") return L("গ্রাম পুলিশ", "Gram Police");
  if (role === "admin") return L("ইউপি প্রশাসনিক কর্মকর্তা", "UP Administrative Officer");
  if (role === "uno") return L("উপজেলা নির্বাহী কর্মকর্তা", "Upazila Nirbahi Officer");
  if (role === "district") return L("জেলা পর্যায়ের কর্মকর্তা", "District Officer");
  if (role === "super") return L("সুপার অ্যাডমিন", "Super Admin");
  return L("উচ্চ পর্যায়ের নির্বাহী প্যানেল", "Higher-Level Executive Panel");
}

export function ApprovalManagement() {
  const { L, user, refresh } = useApp();
  const loadApplicants = useServerFn(listPendingStaff);
  const review = useServerFn(reviewStaffRegistration);
  const provision = useServerFn(createStaff);
  const rejectRequest = useServerFn(rejectStaffRegistrationRequest);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const isSuperAdmin = user?.role === "super";

  const refreshApplicants = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await loadApplicants();
      if (!result.ok) {
        setError(true);
        setApplicants([]);
        setRequests([]);
        toast.error(
          result.error === "mfa_required"
            ? L("অনুমোদন পর্যালোচনার জন্য MFA যাচাই করুন", "Verify MFA to review registrations")
            : result.error === "forbidden"
              ? L("এই পাতায় প্রবেশের অনুমতি নেই", "You don't have access to this page")
              : L("নিবন্ধনের তালিকা লোড করা যায়নি", "Could not load pending registrations"),
        );
      } else {
        setApplicants(
          result.applicants.filter(
            (applicant): applicant is Applicant =>
              applicant.role === "worker" ||
              applicant.role === "police" ||
              applicant.role === "admin" ||
              applicant.role === "uno" ||
              applicant.role === "district" ||
              applicant.role === "super",
          ),
        );
        setRequests(
          result.requests.filter(
            (request): request is RegistrationRequest =>
              (request.role === "worker" ||
                request.role === "police" ||
                request.role === "admin" ||
                request.role === "uno" ||
                request.role === "district" ||
                request.role === "super") &&
              (request.category === "স্বাস্থ্যকর্মী" ||
                request.category === "গ্রাম পুলিশ" ||
                request.category === "ইউপি প্রশাসনিক কর্মকর্তা" ||
                request.category === "উচ্চ পর্যায়ের নির্বাহী প্যানেল") &&
              (request.category === "উচ্চ পর্যায়ের নির্বাহী প্যানেল"
                ? typeof request.jurisdictionId === "string"
                : typeof request.unionId === "string"),
          ),
        );
        notifyPendingApprovalCountChanged();
      }
    } catch (cause) {
      console.error("Could not load pending registrations", cause);
      setApplicants([]);
      setRequests([]);
      setError(true);
      toast.error(L("নিবন্ধনের তালিকা লোড করা যায়নি", "Could not load pending registrations"));
    } finally {
      setLoading(false);
    }
  }, [L, loadApplicants]);

  useEffect(() => {
    void refreshApplicants();
  }, [refreshApplicants]);

  const approveRequest = async (request: RegistrationRequest) => {
    if (!user) return;
    setBusyId(request.id);
    try {
      const result = await provision({
        data: {
          role: request.role,
          nameBn: request.fullName,
          nameEn: request.fullName,
          contact: request.email ?? request.mobile ?? "",
          upazilaId: request.upazilaId,
          unionId: request.unionId ?? undefined,
          jurisdictionId: request.jurisdictionId ?? undefined,
          ward: 1,
          registrationRequestId: request.id,
        },
      });
      if (!result.ok) {
        console.error("Could not provision staff registration request", {
          error: result.error,
        });
        if (result.error === "mfa_required") {
          toast.error(L("অনুমোদনের জন্য MFA যাচাই করুন", "Verify MFA to approve this request"));
        } else if (result.error === "request_unavailable") {
          toast.error(
            L(
              "অনুরোধটি ইতিমধ্যে প্রক্রিয়াধীন বা সম্পন্ন হয়েছে",
              "This request is already being processed or completed",
            ),
          );
        } else if (result.error === "password_setup_failed") {
          toast.error(
            L(
              "পাসওয়ার্ড সেটের ইমেইল পাঠানো যায়নি। Supabase email provider ও Redirect URLs পরীক্ষা করুন।",
              "Password setup email could not be sent. Check the Supabase email provider and Redirect URLs.",
            ),
          );
        } else if (result.error === "auth_create_failed") {
          toast.error(
            L(
              "Auth user তৈরি হয়নি। Supabase server log ও auth.users trigger পরীক্ষা করুন; ইমেইল/ফোন আগে থেকেই নিবন্ধিত কি না দেখুন।",
              "Auth user creation failed. Check the Supabase server log, auth.users triggers, and whether the email/phone already exists.",
            ),
          );
        } else if (result.error === "station_scope_missing") {
          toast.error(
            L(
              "এই ইউনিয়নের administrative_stations রেকর্ড নেই; এলাকা-তালিকা sync করে আবার চেষ্টা করুন।",
              "This union is missing from administrative_stations. Sync the area catalog, then retry.",
            ),
          );
        } else if (result.error === "profile_failed") {
          toast.error(
            L(
              "profiles-এ অ্যাকাউন্টের তথ্য লেখা যায়নি। সার্ভার লগে constraint বা trigger-এর ত্রুটি দেখুন।",
              "Could not write the profile. Check the server log for a profile constraint or trigger error.",
            ),
          );
        } else if (result.error === "role_failed") {
          toast.error(
            L(
              "user_roles-এ role যোগ করা যায়নি। app_role ও user_roles schema/log পরীক্ষা করুন।",
              "Could not assign the role. Check the app_role/user_roles schema and server log.",
            ),
          );
        } else if (result.error === "bad_request") {
          toast.error(
            L(
              "আবেদনটির তথ্য বা schema মেলেনি। আবেদন pending আছে এবং সর্বশেষ 0037–0039 migration প্রয়োগ হয়েছে কি না দেখুন।",
              "The request data or schema did not match. Confirm the request is pending and migrations 0037–0039 are applied.",
            ),
          );
        } else if (result.error === "unavailable") {
          toast.error(
            L(
              "ডাটাবেস যাচাই করা যায়নি। server log এবং registration schema-এর migration অবস্থা পরীক্ষা করুন।",
              "Could not verify the database. Check the server log and registration-schema migration state.",
            ),
          );
        } else if (result.error === "request_update_failed") {
          toast.error(
            L(
              "অনুরোধের অবস্থা হালনাগাদ করা যায়নি। তালিকা রিফ্রেশ করে আবার যাচাই করুন।",
              "Could not finalize the request status. Refresh the list and verify before retrying.",
            ),
          );
        } else if (
          result.error === "bad_upazila" ||
          result.error === "bad_union" ||
          result.error === "bad_email" ||
          result.error === "bad_phone"
        ) {
          toast.error(
            L(
              "আবেদনের ইমেইল/ফোন বা প্রশাসনিক এলাকার তথ্য যাচাই করুন।",
              "Check the request's email/phone and administrative-area data.",
            ),
          );
        } else if (result.error === "forbidden") {
          toast.error(
            L(
              "শুধু aal2-verified Super Admin এই আবেদন অনুমোদন করতে পারবেন।",
              "Only an aal2-verified Super Admin can approve this request.",
            ),
          );
        } else {
          toast.error(
            L("অ্যাকাউন্ট তৈরি ও সক্রিয় করা যায়নি", "Could not create and activate the account"),
          );
        }
        return;
      }
      toast.success(
        request.email
          ? L(
              "অনুরোধ অনুমোদিত; পাসওয়ার্ড সেট করার লিংক ইমেইলে পাঠানো হয়েছে",
              "Request approved; a password setup link was sent by email",
            )
          : L(
              "অনুরোধ অনুমোদিত; অ্যাকাউন্ট সক্রিয় হয়েছে",
              "Request approved; the account is active",
            ),
      );
      if (result.warning === "audit_failed") {
        toast.error(
          L(
            "অ্যাকাউন্ট সক্রিয় হয়েছে, তবে অডিট লগ সংরক্ষণ হয়নি",
            "Account is active, but audit logging failed",
          ),
        );
      }
      await refreshApplicants();
      await refresh();
    } catch (cause) {
      console.error("Could not approve staff registration request", cause);
      toast.error(
        L("অ্যাকাউন্ট তৈরি ও সক্রিয় করা যায়নি", "Could not create and activate the account"),
      );
      void refreshApplicants();
    } finally {
      setBusyId(null);
    }
  };

  const dismissRequest = async (request: RegistrationRequest) => {
    setBusyId(request.id);
    try {
      const result = await rejectRequest({ data: { requestId: request.id } });
      if (!result.ok) {
        toast.error(
          result.error === "mfa_required"
            ? L("অনুরোধ প্রত্যাখ্যান করতে MFA যাচাই করুন", "Verify MFA to reject this request")
            : L("অনুরোধ প্রত্যাখ্যান করা যায়নি", "Could not reject the request"),
        );
        return;
      }
      toast.success(L("নিবন্ধনের অনুরোধ প্রত্যাখ্যান করা হয়েছে", "Registration request rejected"));
      if (result.warning === "audit_failed") {
        toast.error(
          L(
            "অনুরোধ প্রত্যাখ্যাত হয়েছে, তবে অডিট লগ সংরক্ষণ হয়নি",
            "Request rejected, but audit logging failed",
          ),
        );
      }
      await refreshApplicants();
    } catch (cause) {
      console.error("Could not reject staff registration request", cause);
      toast.error(L("অনুরোধ প্রত্যাখ্যান করা যায়নি", "Could not reject the request"));
      void refreshApplicants();
    } finally {
      setBusyId(null);
    }
  };

  const decide = async (applicant: Applicant, decision: "approve" | "reject") => {
    setBusyId(applicant.id);
    try {
      const result = await review({ data: { userId: applicant.id, decision } });
      if (!result.ok) {
        toast.error(
          result.error === "not_pending_or_forbidden"
            ? L(
                "এই আবেদনটি আর অপেক্ষমাণ নেই বা আপনার এলাকার নয়",
                "This registration is no longer pending or outside your jurisdiction",
              )
            : result.error === "mfa_required"
              ? L("অনুমোদন পরিবর্তনের জন্য MFA যাচাই করুন", "Verify MFA to change approval status")
              : L("নিবন্ধনের অবস্থা হালনাগাদ করা যায়নি", "Could not update registration status"),
        );
      } else {
        setApplicants((current) => current.filter((item) => item.id !== applicant.id));
        notifyPendingApprovalCountChanged();
        toast.success(
          decision === "approve"
            ? L("ব্যবহারকারী অনুমোদিত হয়েছে", "User approved")
            : L("নিবন্ধন প্রত্যাখ্যান করা হয়েছে", "Registration rejected"),
        );
        if (result.warning === "audit_failed") {
          toast.error(
            L(
              "অবস্থা পরিবর্তিত হয়েছে, তবে নিরীক্ষা লগ সংরক্ষণ হয়নি",
              "Status changed, but audit logging failed",
            ),
          );
        }
      }
    } catch (cause) {
      console.error("Could not update staff approval status", cause);
      toast.error(
        L("নিবন্ধনের অবস্থা হালনাগাদ করা যায়নি", "Could not update registration status"),
      );
      void refreshApplicants();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="w-full max-w-none py-6">
      <PageTitle
        title={L("অনুমোদন ব্যবস্থাপনা", "Staff approval")}
        sub={L("সকল এলাকার অপেক্ষমাণ কর্মী নিবন্ধন", "Pending staff registrations from all areas")}

        actions={
          <Button variant="outline" onClick={() => void refreshApplicants()} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {L("হালনাগাদ", "Refresh")}
          </Button>
        }
      />

      {loading ? (
        <p className="py-12 text-center text-muted-foreground" role="status">
          {L("নিবন্ধনের তালিকা লোড হচ্ছে…", "Loading registrations…")}
        </p>
      ) : error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 text-center">
          <p className="mb-3 text-sm text-muted-foreground">
            {L(
              "নিবন্ধনের তালিকা পাওয়া যায়নি। আবার চেষ্টা করুন।",
              "The registration list is unavailable. Please try again.",
            )}
          </p>
          <Button variant="outline" onClick={() => void refreshApplicants()}>
            {L("আবার চেষ্টা করুন", "Try again")}
          </Button>
        </div>
      ) : applicants.length === 0 && requests.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
          {L(
            isSuperAdmin
              ? "অপেক্ষমাণ নিবন্ধনের অনুরোধ নেই"
              : "আপনার ইউনিয়নে অপেক্ষমাণ কর্মী নিবন্ধন নেই",
            isSuperAdmin
              ? "There are no pending registration requests"
              : "There are no pending staff registrations in your union",
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => (
            <article
              key={request.id}
              className="flex flex-col gap-4 rounded-xl border border-emerald-200 bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <h2 className="font-semibold">{request.fullName}</h2>
                <p className="text-sm text-muted-foreground">
                  {request.category}
                  {request.requestedPosition && (
                    <>
                      {" · "}
                      {EXECUTIVE_POSITIONS.find(
                        (position) => position.role === request.requestedPosition,
                      )?.bn ?? request.requestedPosition}
                    </>
                  )}
                  {" · "}
                  {roleName(request.role, L)} · {request.unionName}
                </p>
                <p className="break-all text-sm">{request.email ?? request.mobile}</p>

                <p className="mt-1 text-xs text-muted-foreground">
                  {L("আবেদনের তারিখ", "Submitted")} ·{" "}
                  {new Date(request.createdAt).toLocaleDateString(L("bn-BD", "en-US"))}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button disabled={busyId !== null} onClick={() => void approveRequest(request)}>
                  <Check className="mr-1 h-4 w-4" />
                  {L("অনুমোদন ও সক্রিয় করুন", "Approve & activate")}
                </Button>
                <Button
                  variant="destructive"
                  disabled={busyId !== null}
                  onClick={() => void dismissRequest(request)}
                >
                  <X className="mr-1 h-4 w-4" />
                  {L("প্রত্যাখ্যান", "Reject")}
                </Button>
              </div>
            </article>
          ))}
          {applicants.map((applicant) => (
            <article
              key={applicant.id}
              className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <h2 className="font-semibold">{applicant.nameEn || applicant.nameBn}</h2>
                {applicant.nameBn && applicant.nameBn !== applicant.nameEn && (
                  <p className="text-sm text-muted-foreground">{applicant.nameBn}</p>
                )}
                <p className="text-sm text-muted-foreground">{roleName(applicant.role, L)}</p>
                <p className="break-all text-sm">{applicant.email ?? applicant.mobile}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {L("আবেদনের তারিখ", "Submitted")} ·{" "}
                  {new Date(applicant.createdAt).toLocaleDateString(L("bn-BD", "en-US"))}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  disabled={busyId !== null}
                  onClick={() => void decide(applicant, "approve")}
                >
                  <Check className="mr-1 h-4 w-4" />
                  {L("অনুমোদন", "Approve")}
                </Button>
                <Button
                  variant="destructive"
                  disabled={busyId !== null}
                  onClick={() => void decide(applicant, "reject")}
                >
                  <X className="mr-1 h-4 w-4" />
                  {L("প্রত্যাখ্যান", "Reject")}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
