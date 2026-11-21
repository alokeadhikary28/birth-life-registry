import { useMemo, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Eye, Pencil, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BANGLADESH_ADMINISTRATIVE_AREAS } from "@/lib/geography";
import { EXECUTIVE_POSITIONS } from "@/lib/dashboard-roles";
import { manageSuperAdminProfile } from "@/lib/auth.functions";
import { roleLabel, useApp } from "@/lib/store";
import {
  getSuperUserAccountStatus,
  type SuperUserAccountStatus,
} from "@/lib/super-dashboard-users";
import type { Upazila, User } from "@/lib/types";

type DialogMode = "details" | "edit" | "status";
type ManagedStatus = Exclude<SuperUserAccountStatus, "approved"> | "approved";

const ACCOUNT_STATUS_OPTIONS: ManagedStatus[] = ["approved", "pending", "suspended", "cancelled"];

function statusPresentation(status: SuperUserAccountStatus, L: (bn: string, en: string) => string) {
  switch (status) {
    case "approved":
      return {
        label: L("অনুমোদিত", "Approved"),
        className: "border-emerald-200 bg-emerald-50 text-emerald-800",
      };
    case "pending":
      return {
        label: L("অপেক্ষমাণ", "Pending"),
        className: "border-amber-200 bg-amber-50 text-amber-900",
      };
    case "suspended":
      return {
        label: L("স্থগিত", "Suspended"),
        className: "border-orange-200 bg-orange-50 text-orange-900",
      };
    case "cancelled":
      return {
        label: L("বাতিল", "Cancelled"),
        className: "border-rose-200 bg-rose-50 text-rose-800",
      };
  }
}

function accountStatusLabel(status: ManagedStatus, L: (bn: string, en: string) => string) {
  return statusPresentation(status, L).label;
}

function userDisplayName(item: User, L: (bn: string, en: string) => string) {
  return (
    L(item.name.bn || item.name.en, item.name.en || item.name.bn).trim() ||
    item.email?.trim() ||
    roleLabel(item.role, L)
  );
}

export function SuperUserList({
  users,
  upazilas,
  title,
  description,
}: {
  users: User[];
  upazilas: Upazila[];
  title: string;
  description: string;
}) {
  const { L, n, refresh } = useApp();
  const saveManagedProfile = useServerFn(manageSuperAdminProfile);
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{ mode: DialogMode; user: User } | null>(null);
  const [nextStatus, setNextStatus] = useState<ManagedStatus>("approved");
  const [editValues, setEditValues] = useState({ nameBn: "", nameEn: "", mobile: "" });
  const [busy, setBusy] = useState(false);

  const matchingUsers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return users;
    return users.filter((item) => {
      const upazila = upazilas.find((area) => area.id === item.upazilaId);
      const assignedUnion = item.unionId ?? item.stationId;
      const union = upazilas
        .flatMap((area) => area.unions)
        .find((area) => area.id === assignedUnion);
      const position = EXECUTIVE_POSITIONS.find(
        (candidate) => candidate.role === item.executivePosition,
      );
      return [
        item.name.bn,
        item.name.en,
        item.mobile,
        item.email,
        roleLabel(item.role, L),
        position ? L(position.bn, position.en) : "",
        upazila ? L(upazila.bn, upazila.en) : "",
        union?.bn,
        statusPresentation(getSuperUserAccountStatus(item), L).label,
      ]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLocaleLowerCase().includes(query));
    });
  }, [L, search, upazilas, users]);

  const openDialog = (mode: DialogMode, target: User) => {
    setDialog({ mode, user: target });
    if (mode === "edit") {
      setEditValues({
        nameBn: target.name.bn,
        nameEn: target.name.en,
        mobile: target.mobile ?? "",
      });
    }
    if (mode === "status") setNextStatus(getSuperUserAccountStatus(target));
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dialog || dialog.mode !== "edit") return;
    setBusy(true);
    try {
      const result = await saveManagedProfile({
        data: {
          operation: "edit",
          userId: dialog.user.id,
          ...editValues,
        },
      });
      if (!result.ok) {
        toast.error(
          result.error === "mfa_required"
            ? L("এই কাজের জন্য MFA যাচাই প্রয়োজন", "MFA verification is required for this action")
            : result.error === "bad_phone"
              ? L("সঠিক মোবাইল নম্বর দিন", "Enter a valid mobile number")
              : result.error === "forbidden" || result.error === "protected_account"
                ? L("এই ব্যবহারকারীর তথ্য সম্পাদনার অনুমতি নেই", "You cannot edit this account")
                : L("ব্যবহারকারীর তথ্য সংরক্ষণ করা যায়নি", "Could not save user details"),
        );
        return;
      }
      toast.success(L("ব্যবহারকারীর তথ্য হালনাগাদ হয়েছে", "User details updated"));
      if (result.warning) {
        toast.warning(
          L("পরিবর্তন হয়েছে, তবে অডিট লগ সংরক্ষণ হয়নি", "Updated, but audit logging failed"),
        );
      }
      setDialog(null);
      await refresh();
    } catch (error) {
      console.error("Could not save Super Admin managed profile", error);
      toast.error(L("ব্যবহারকারীর তথ্য সংরক্ষণ করা যায়নি", "Could not save user details"));
    } finally {
      setBusy(false);
    }
  };

  const saveStatus = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dialog || dialog.mode !== "status") return;
    setBusy(true);
    try {
      const result = await saveManagedProfile({
        data: {
          operation: "status",
          userId: dialog.user.id,
          status: nextStatus,
        },
      });
      if (!result.ok) {
        toast.error(
          result.error === "mfa_required"
            ? L("এই কাজের জন্য MFA যাচাই প্রয়োজন", "MFA verification is required for this action")
            : result.error === "forbidden" || result.error === "protected_account"
              ? L("এই অ্যাকাউন্টের অবস্থা পরিবর্তন করা যাবে না", "This account cannot be changed")
              : L("অ্যাকাউন্টের অবস্থা সংরক্ষণ করা যায়নি", "Could not update account status"),
        );
        return;
      }
      toast.success(
        L(
          `অ্যাকাউন্টের অবস্থা “${accountStatusLabel(nextStatus, L)}” করা হয়েছে`,
          `Account status changed to “${accountStatusLabel(nextStatus, L)}”`,
        ),
      );
      if (result.warning) {
        toast.warning(
          L("পরিবর্তন হয়েছে, তবে অডিট লগ সংরক্ষণ হয়নি", "Updated, but audit logging failed"),
        );
      }
      setDialog(null);
      await refresh();
    } catch (error) {
      console.error("Could not change Super Admin managed account status", error);
      toast.error(L("অ্যাকাউন্টের অবস্থা সংরক্ষণ করা যায়নি", "Could not update account status"));
    } finally {
      setBusy(false);
    }
  };

  const getAreaDetails = (item: User) => {
    const upazila = upazilas.find((area) => area.id === item.upazilaId);
    const district = BANGLADESH_ADMINISTRATIVE_AREAS.find(
      (area) => area.level === "district" && area.id === item.districtId,
    );
    const division = BANGLADESH_ADMINISTRATIVE_AREAS.find(
      (area) => area.level === "division" && area.id === district?.divisionId,
    );
    const unionId = item.unionId ?? item.stationId;
    const union = upazilas.flatMap((area) => area.unions).find((area) => area.id === unionId);
    return {
      division: upazila
        ? L(upazila.divisionBn, upazila.divisionEn)
        : division
          ? L(division.bn, division.en)
          : "—",
      district: upazila
        ? L(upazila.districtBn, upazila.districtEn)
        : district
          ? L(district.bn, district.en)
          : "—",
      upazila: upazila ? L(upazila.bn, upazila.en) : "—",
      union: union?.bn?.trim() || union?.en?.trim() || "—",
    };
  };

  const getRoleName = (item: User) => {
    const position = EXECUTIVE_POSITIONS.find(
      (candidate) => candidate.role === item.executivePosition,
    );
    return position ? L(position.bn, position.en) : roleLabel(item.role, L);
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
      <header className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold leading-8 text-slate-950">{title}</h2>
          <p className="text-sm leading-6 text-slate-600">{description}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative block w-full sm:w-72">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500"
            />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={L("নাম, মোবাইল বা এলাকা খুঁজুন", "Search name, contact, or area")}
              aria-label={L("ব্যবহারকারী খুঁজুন", "Search users")}
              className="h-10 pl-9"
            />
          </label>
          <span className="inline-flex h-10 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-3 text-sm font-bold text-emerald-900">
            {L("মোট", "Total")} {n(matchingUsers.length)}
          </span>
        </div>
      </header>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <Table className="min-w-[120rem]">
          <TableHeader>
            <TableRow className="border-0 bg-emerald-800 hover:bg-emerald-800">
              <TableHead className="w-16 whitespace-nowrap bg-emerald-800 px-3 py-3 text-center text-sm font-bold text-white">
                {L("ক্রমিক নং", "No.")}
              </TableHead>
              <TableHead className="whitespace-nowrap bg-emerald-800 px-3 py-3 text-sm font-bold text-white">
                {L("নাম", "Name")}
              </TableHead>
              <TableHead className="whitespace-nowrap bg-emerald-800 px-3 py-3 text-sm font-bold text-white">
                {L("ভূমিকা", "Role")}
              </TableHead>
              <TableHead className="whitespace-nowrap bg-emerald-800 px-3 py-3 text-sm font-bold text-white">
                {L("মোবাইল / যোগাযোগ", "Mobile / contact")}
              </TableHead>
              <TableHead className="whitespace-nowrap bg-emerald-800 px-3 py-3 text-sm font-bold text-white">
                {L("বিভাগ", "Division")}
              </TableHead>
              <TableHead className="whitespace-nowrap bg-emerald-800 px-3 py-3 text-sm font-bold text-white">
                {L("জেলা", "District")}
              </TableHead>
              <TableHead className="whitespace-nowrap bg-emerald-800 px-3 py-3 text-sm font-bold text-white">
                {L("উপজেলা", "Upazila")}
              </TableHead>
              <TableHead className="whitespace-nowrap bg-emerald-800 px-3 py-3 text-sm font-bold text-white">
                {L("ইউনিয়ন", "Union")}
              </TableHead>
              <TableHead className="whitespace-nowrap bg-emerald-800 px-3 py-3 text-sm font-bold text-white">
                {L("অনুমোদনের অবস্থা", "Approval status")}
              </TableHead>
              <TableHead className="whitespace-nowrap bg-emerald-800 px-3 py-3 text-sm font-bold text-white">
                {L("কার্যক্রম", "Actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {matchingUsers.length ? (
              matchingUsers.map((item, index) => {
                const area = getAreaDetails(item);
                const status = getSuperUserAccountStatus(item);
                const statusInfo = statusPresentation(status, L);
                const protectedAccount = item.role === "super";
                return (
                  <TableRow
                    key={item.id}
                    className={`border-b border-slate-200 transition-colors duration-150 hover:bg-emerald-100/60 ${
                      index % 2 === 0 ? "bg-white" : "bg-emerald-50/45"
                    }`}
                  >
                    <TableCell className="whitespace-nowrap px-3 py-3 text-center font-semibold tabular-nums text-slate-700">
                      {n(index + 1)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-3 font-semibold text-slate-900">
                      <span className="block max-w-56 truncate" title={userDisplayName(item, L)}>
                        {userDisplayName(item, L)}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-3 text-slate-800">
                      {getRoleName(item)}
                    </TableCell>
                    <TableCell className="px-3 py-3 text-slate-800">
                      <span className="block whitespace-nowrap">{item.mobile || "—"}</span>
                      {item.email && (
                        <span
                          className="block max-w-48 truncate text-xs text-slate-500"
                          title={item.email}
                        >
                          {item.email}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-3 text-slate-800">
                      {area.division}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-3 text-slate-800">
                      {area.district}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-3 text-slate-800">
                      {area.upazila}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-3 font-medium text-slate-900">
                      {area.union}
                    </TableCell>
                    <TableCell className="px-3 py-3">
                      <span
                        className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-sm font-semibold ${statusInfo.className}`}
                      >
                        {statusInfo.label}
                      </span>
                    </TableCell>
                    <TableCell className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 whitespace-nowrap border-slate-300 px-2 text-xs"
                          onClick={() => openDialog("details", item)}
                        >
                          <Eye aria-hidden="true" className="mr-1 size-3.5" />
                          {L("বিস্তারিত", "Details")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 whitespace-nowrap border-emerald-300 px-2 text-xs text-emerald-800 hover:bg-emerald-50"
                          disabled={protectedAccount}
                          onClick={() => openDialog("edit", item)}
                        >
                          <Pencil aria-hidden="true" className="mr-1 size-3.5" />
                          {L("সম্পাদনা", "Edit")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 whitespace-nowrap border-amber-300 px-2 text-xs text-amber-900 hover:bg-amber-50"
                          disabled={protectedAccount}
                          onClick={() => openDialog("status", item)}
                        >
                          <SlidersHorizontal aria-hidden="true" className="mr-1 size-3.5" />
                          {L("অবস্থা পরিবর্তন", "Change status")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow className="bg-white">
                <TableCell colSpan={10} className="px-4 py-10 text-center text-slate-600">
                  {search
                    ? L("অনুসন্ধানে কোনো ব্যবহারকারী পাওয়া যায়নি", "No users match your search")
                    : L("এই বিভাগে কোনো ব্যবহারকারী নেই", "No users found in this category")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        {dialog && (
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
            {dialog.mode === "details" && (
              <>
                <DialogHeader>
                  <DialogTitle>{L("ব্যবহারকারীর বিস্তারিত", "User details")}</DialogTitle>
                  <DialogDescription>
                    {L("প্রোফাইল ও প্রশাসনিক এলাকার তথ্য", "Profile and administrative area")}
                  </DialogDescription>
                </DialogHeader>
                <dl className="grid gap-3 sm:grid-cols-2">
                  {[
                    [L("নাম", "Name"), userDisplayName(dialog.user, L)],
                    [L("ভূমিকা", "Role"), getRoleName(dialog.user)],
                    [L("মোবাইল", "Mobile"), dialog.user.mobile || "—"],
                    [L("ইমেইল", "Email"), dialog.user.email || "—"],
                    [L("বিভাগ", "Division"), getAreaDetails(dialog.user).division],
                    [L("জেলা", "District"), getAreaDetails(dialog.user).district],
                    [L("উপজেলা", "Upazila"), getAreaDetails(dialog.user).upazila],
                    [L("ইউনিয়ন", "Union"), getAreaDetails(dialog.user).union],
                    [
                      L("অনুমোদনের অবস্থা", "Approval status"),
                      statusPresentation(getSuperUserAccountStatus(dialog.user), L).label,
                    ],
                    [L("ইউজার আইডি", "User ID"), dialog.user.id],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {label}
                      </dt>
                      <dd className="mt-1 break-words text-sm font-medium text-slate-900">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                    {L("বন্ধ করুন", "Close")}
                  </Button>
                </DialogFooter>
              </>
            )}
            {dialog.mode === "edit" && (
              <form className="space-y-4" onSubmit={(event) => void saveProfile(event)}>
                <DialogHeader>
                  <DialogTitle>{L("ব্যবহারকারীর তথ্য সম্পাদনা", "Edit user details")}</DialogTitle>
                  <DialogDescription>
                    {L("নাম ও যোগাযোগের তথ্য হালনাগাদ করুন", "Update the name and contact details")}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="managed-user-name-bn">
                      {L("নাম (বাংলা)", "Name (Bangla)")}
                    </Label>
                    <Input
                      id="managed-user-name-bn"
                      required
                      maxLength={100}
                      value={editValues.nameBn}
                      onChange={(event) =>
                        setEditValues((current) => ({ ...current, nameBn: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="managed-user-name-en">
                      {L("নাম (ইংরেজি)", "Name (English)")}
                    </Label>
                    <Input
                      id="managed-user-name-en"
                      required
                      maxLength={100}
                      value={editValues.nameEn}
                      onChange={(event) =>
                        setEditValues((current) => ({ ...current, nameEn: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="managed-user-mobile">
                      {L("মোবাইল / যোগাযোগ", "Mobile / contact")}
                    </Label>
                    <Input
                      id="managed-user-mobile"
                      maxLength={20}
                      value={editValues.mobile}
                      onChange={(event) =>
                        setEditValues((current) => ({ ...current, mobile: event.target.value }))
                      }
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                    {L("বাতিল", "Cancel")}
                  </Button>
                  <Button type="submit" disabled={busy}>
                    {busy ? L("সংরক্ষণ হচ্ছে…", "Saving…") : L("পরিবর্তন সংরক্ষণ", "Save changes")}
                  </Button>
                </DialogFooter>
              </form>
            )}
            {dialog.mode === "status" && (
              <form className="space-y-4" onSubmit={(event) => void saveStatus(event)}>
                <DialogHeader>
                  <DialogTitle>
                    {L("অ্যাকাউন্টের অবস্থা পরিবর্তন", "Change account status")}
                  </DialogTitle>
                  <DialogDescription>
                    {L(
                      `${userDisplayName(dialog.user, L)}-এর প্রবেশাধিকার ও অবস্থা নির্ধারণ করুন।`,
                      `Set the access state for ${userDisplayName(dialog.user, L)}.`,
                    )}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-1.5">
                  <Label htmlFor="managed-user-status">{L("নতুন অবস্থা", "New status")}</Label>
                  <Select
                    value={nextStatus}
                    onValueChange={(value) => setNextStatus(value as ManagedStatus)}
                  >
                    <SelectTrigger id="managed-user-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_STATUS_OPTIONS.map((status) => (
                        <SelectItem key={status} value={status}>
                          {accountStatusLabel(status, L)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                    {L("ফিরে যান", "Back")}
                  </Button>
                  <Button type="submit" disabled={busy}>
                    {busy ? L("হালনাগাদ হচ্ছে…", "Updating…") : L("অবস্থা সংরক্ষণ", "Save status")}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
}
