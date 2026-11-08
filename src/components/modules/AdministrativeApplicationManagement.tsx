import { useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Clock3, Filter, Home, Search, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/shared";
import { useApp } from "@/lib/store";
import type { RegCase, Status } from "@/lib/types";

export function AdministrativeApplicationManagement({
  type,
  cases,
  onHome,
}: {
  type: "birth" | "death";
  cases?: RegCase[] | null;
  onHome?: () => void;
}) {
  const { L, n, patchCase } = useApp();
  const safeCases = Array.isArray(cases) ? cases : [];
  const formatDate = (value: number) => {
    if (!Number.isFinite(value)) return "—";
    return new Intl.DateTimeFormat(L("bn-BD", "en-US"), { dateStyle: "medium" }).format(value);
  };
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | Status>("all");
  const [ward, setWard] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return safeCases
      .filter((item) => item.type === type)
      .filter((item) => status === "all" || item.status === status)
      .filter((item) => ward === "all" || String(item.ward) === ward)
      .filter((item) => !query || [item.id, item.name?.bn ?? "", item.name?.en ?? "", item.father?.bn ?? "", item.mother?.bn ?? "", item.regNo ?? ""]
        .some((value) => value.toLocaleLowerCase().includes(query)))
      .sort((left, right) => right.createdAt - left.createdAt);
  }, [safeCases, search, status, type, ward]);

  const wards = useMemo(() => [...new Set(safeCases.filter((item) => item.type === type).map((item) => item.ward))].sort((a, b) => a - b), [safeCases, type]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const updateStatus = async (item: RegCase, nextStatus: Status) => {
    if (item.status === "completed" && item.police?.directApproval && nextStatus !== "completed") {
      return;
    }
    if (nextStatus === "completed") {
      const regNo = window.prompt(L("১৭ সংখ্যার নিবন্ধন নম্বর লিখুন", "Enter the 17-digit registration number"));
      if (!regNo || !/^\d{17}$/.test(regNo.trim())) {
        if (regNo !== null) window.alert(L("নিবন্ধন নম্বরটি অবশ্যই ১৭ সংখ্যার হতে হবে।", "The registration number must contain exactly 17 digits."));
        return;
      }
      await patchCase(item.id, {
        status: "completed",
        regNo: regNo.trim(),
        police: { ...(item.police ?? {}), directApproval: true },
      });
      return;
    }
    await patchCase(item.id, {
      status: nextStatus,
      ...(nextStatus === "progress" && item.status === "completed" ? { regNo: "" } : {}),
    });
  };

  const counts = {
    pending: safeCases.filter((item) => item.type === type && item.status === "pending").length,
    progress: safeCases.filter((item) => item.type === type && item.status === "progress").length,
    completed: safeCases.filter((item) => item.type === type && item.status === "completed").length,
    rejected: safeCases.filter((item) => item.type === type && item.status === "rejected").length,
  };

  return (
    <section className="mx-auto w-full max-w-none space-y-4 pb-4">
      <header className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-emerald-700">{L("ইউপি সচিব / প্রশাসনিক কর্মকর্তার ইউনিয়ন-ওভারসাইট", "UP Secretary / Administrative Officer Union Oversight")}</p>
            <h1 className="mt-1 font-display text-xl font-bold text-emerald-950 sm:text-2xl">
              {type === "birth" ? L("জন্ম নিবন্ধন আবেদন ব্যবস্থাপনা", "Birth Registration Application Management") : L("মৃত্যু নিবন্ধন আবেদন ব্যবস্থাপনা", "Death Registration Application Management")}
            </h1>
          </div>
          <Button type="button" variant="outline" onClick={() => onHome?.()}>
            <Home className="mr-2 h-4 w-4" />{L("হোমে ফিরুন", "Back to home")}
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {([
          ["pending", counts.pending, Clock3, "amber"],
          ["progress", counts.progress, ClipboardCheck, "blue"],
          ["completed", counts.completed, CheckCircle2, "emerald"],
          ["rejected", counts.rejected, ShieldAlert, "red"],
        ] as const).map(([key, count, Icon, color]) => (
          <div key={key} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between">
              <Icon className={`h-5 w-5 text-${color}-700`} />
              <b className="text-xl text-slate-900">{n(count)}</b>
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-600">
              {key === "pending" ? L("অপেক্ষমাণ", "Pending") : key === "progress" ? L("প্রক্রিয়াধীন", "In progress") : key === "completed" ? L("অনুমোদিত", "Approved") : L("বাতিল", "Rejected")}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <label className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input className="pl-9" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={L("নাম, আবেদন নম্বর বা নিবন্ধন নম্বর", "Name, application or registration number")} />
        </label>
        <Select value={status} onValueChange={(value) => { setStatus(value as "all" | Status); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-44"><Filter className="mr-2 h-4 w-4" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{L("সব অবস্থা", "All statuses")}</SelectItem>
            <SelectItem value="pending">{L("অপেক্ষমাণ", "Pending")}</SelectItem>
            <SelectItem value="progress">{L("প্রক্রিয়াধীন", "In progress")}</SelectItem>
            <SelectItem value="completed">{L("অনুমোদিত", "Approved")}</SelectItem>
            <SelectItem value="rejected">{L("বাতিল", "Rejected")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={ward} onValueChange={(value) => { setWard(value); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder={L("সব ওয়ার্ড", "All wards")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{L("সব ওয়ার্ড", "All wards")}</SelectItem>
            {wards.map((item) => <SelectItem key={item} value={String(item)}>{L(`ওয়ার্ড ${n(item)}`, `Ward ${item}`)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-emerald-50 text-xs font-bold text-emerald-950">
            <tr><th className="p-3">{L("আবেদনকারীর নাম", "Applicant")}</th><th className="p-3">{L("গ্রাম ও ওয়ার্ড", "Village & ward")}</th><th className="p-3">{L("জমার তারিখ", "Submitted")}</th><th className="p-3">{L("অবস্থা", "Status")}</th><th className="p-3 text-right">{L("সচিবের কার্যক্রম", "Secretary actions")}</th></tr>
          </thead>
          <tbody>
            {visible.map((item) => {
              return (
                <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3"><p className="font-bold text-slate-900">{L(item.name?.bn ?? "নাম নেই", item.name?.en ?? "No name")}</p><p className="text-xs text-slate-500">#{String(item.id ?? "—").slice(0, 8)}</p></td>
                  <td className="p-3"><p className="font-semibold">{L(`ওয়ার্ড ${n(item.ward)}`, `Ward ${item.ward}`)}</p><p className="text-xs text-slate-500">{item.villageId}</p></td>
                  <td className="p-3 text-xs text-slate-600">{formatDate(item.createdAt)}</td>
                  <td className="p-3"><StatusBadge status={item.status} /></td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1.5">
                      {item.status === "pending" && <Button size="sm" variant="outline" onClick={() => void updateStatus(item, "progress")}>{L("প্রক্রিয়াধীন", "Start review")}</Button>}
                      {item.status !== "completed" && item.status !== "rejected" && <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800" onClick={() => void updateStatus(item, "completed")}>{L("নিবন্ধন অনুমোদন", "Approve")}</Button>}
                      {item.status !== "rejected" && item.status !== "completed" && <Button size="sm" variant="outline" className="border-red-200 text-red-700" onClick={() => void updateStatus(item, "rejected")}>{L("বাতিল", "Reject")}</Button>}
                      {item.status === "completed" && !item.police?.directApproval && <Button size="sm" variant="outline" onClick={() => void updateStatus(item, "progress")}>{L("অনুমোদন প্রত্যাহার", "Revoke")}</Button>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-500">{L("কোনো আবেদন পাওয়া যায়নি", "No applications found")}</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">{n(filtered.length)} {L("টি আবেদন", "applications")}</span>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button type="button" size="sm" variant="outline" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
    </section>
  );
}
