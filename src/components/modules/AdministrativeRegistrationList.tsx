import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Clock3, Filter, Home, Printer, Search, ShieldAlert, XCircle, Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/shared";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/store";
import type { RegCase, Status } from "@/lib/types";

export function AdministrativeRegistrationList({
  type,
  cases,
  onHome,
}: {
  type: "birth" | "death";
  cases?: RegCase[] | null;
  onHome?: () => void;
}) {
  const { L, n, user, state, patchCase, findVillage } = useApp();
  const safeCases = useMemo(
    () => (Array.isArray(cases) ? cases.filter((item) => item?.type === type) : []),
    [cases, type],
  );
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | Status>("all");
  const [ward, setWard] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<RegCase | null>(null);
  const [assignmentCase, setAssignmentCase] = useState<RegCase | null>(null);
  const [assignmentPoliceId, setAssignmentPoliceId] = useState("");
  const [visitPhotoPreview, setVisitPhotoPreview] = useState<{ src: string; title: string; objectUrl: boolean } | null>(null);
  const pageSize = 10;
  const availablePolice = state.users.filter(
    (candidate) =>
      candidate.role === "police" &&
      candidate.active !== false &&
      candidate.upazilaId === user?.upazilaId &&
      candidate.unionId === user?.unionId,
  );
  useEffect(() => {
    if (!visitPhotoPreview?.objectUrl) return;
    const objectUrl = visitPhotoPreview.src;
    return () => URL.revokeObjectURL(objectUrl);
  }, [visitPhotoPreview]);

  const formatDate = (value?: string | number) => {
    const timestamp = typeof value === "string" ? Date.parse(value) : value;
    if (!Number.isFinite(timestamp)) return "—";
    return new Intl.DateTimeFormat(L("bn-BD", "en-US"), { day: "2-digit", month: "long", year: "numeric" }).format(timestamp as number);
  };

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return safeCases
      .filter((item) => status === "all" || item.status === status)
      .filter((item) => ward === "all" || String(item.ward) === ward)
      .filter((item) => {
        if (!query) return true;
        const found = findVillage(item.villageId);
        return [item.id, item.regNo ?? "", item.name?.bn, item.name?.en, item.father?.bn, item.father?.en, item.mother?.bn, item.mother?.en, found?.v.bn, found?.v.en]
          .some((value) => String(value ?? "").toLocaleLowerCase().includes(query));
      })
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }, [safeCases, search, status, ward, findVillage]);

  const counts = useMemo(() => ({
    total: safeCases.length,
    pending: safeCases.filter((item) => item.status === "pending").length,
    progress: safeCases.filter((item) => item.status === "progress").length,
    completed: safeCases.filter((item) => item.status === "completed").length,
    rejected: safeCases.filter((item) => item.status === "rejected").length,
  }), [safeCases]);
  const wards = useMemo(() => [...new Set(safeCases.map((item) => Number(item.ward)).filter(Number.isFinite))].sort((a, b) => a - b), [safeCases]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const approve = async (item: RegCase) => {
    const regNo = window.prompt(type === "birth" ? L("১৭ সংখ্যার জন্ম নিবন্ধন নম্বর দিন", "Enter the 17-digit Birth Registration Number") : L("১৭ সংখ্যার মৃত্যু নিবন্ধন নম্বর দিন", "Enter the 17-digit Death Registration Number"));
    if (regNo === null) return;
    if (!/^\d{17}$/.test(regNo.trim())) {
      window.alert(L("নিবন্ধন নম্বরটি অবশ্যই ১৭ সংখ্যার হতে হবে।", "Registration number must contain exactly 17 digits."));
      return;
    }
    await patchCase(item.id, {
      status: "completed",
      regNo: regNo.trim(),
      police: { ...(item.police ?? {}), directApproval: true },
    });
  };
  const reject = async (item: RegCase) => {
    if (!window.confirm(L("এই আবেদনটি বাতিল করবেন?", "Reject this application?"))) return;
    await patchCase(item.id, { status: "rejected" });
  };
  const assignForFieldVisit = async () => {
    const item = assignmentCase;
    const assignedPolice = availablePolice.find((candidate) => candidate.id === assignmentPoliceId);
    if (!item || !assignedPolice || assignedPolice.ward !== item.ward) return;
    const updated = await patchCase(item.id, {
      status: "progress",
      police: {
        ...(item.police ?? {}),
        assignedPoliceId: assignedPolice.id,
        assignedAt: new Date().toISOString(),
        assignedBy: user?.id,
        fieldVisitDays: item.police?.fieldVisitDays ?? [],
      },
    });
    if (updated) {
      toast.success(L("পরিদর্শনের জন্য গ্রামপুলিশ নির্ধারণ করা হয়েছে", "Village police assigned for the field visit"));
      setAssignmentCase(null);
    }
  };
  const openVisitPhoto = async (item: RegCase, day: number) => {
    const evidence = item.police?.fieldVisitDays?.find((visit) => visit.day === day);
    if (!evidence) return;
    try {
      if (evidence.photo.dataUrl) {
        setVisitPhotoPreview({ src: evidence.photo.dataUrl, title: L(`দিন ${n(day)}-এর পরিদর্শন`, `Day ${day} visit`), objectUrl: false });
        return;
      }
      if (evidence.photo.path) {
        const { data, error } = await supabase.storage.from("case-files").download(evidence.photo.path);
        if (error) throw error;
        setVisitPhotoPreview({ src: URL.createObjectURL(data), title: L(`দিন ${n(day)}-এর পরিদর্শন`, `Day ${day} visit`), objectUrl: true });
        return;
      }
      throw new Error(L("ছবিটি পাওয়া যায়নি", "Photo is unavailable"));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      toast.error(L(`ছবি খোলা যায়নি: ${message}`, `Could not open photo: ${message}`));
    }
  };
  const printItem = (item: RegCase) => {
    const found = findVillage(item.villageId);
    const popup = window.open("", "_blank", "width=900,height=700");
    if (!popup) return;
    popup.document.write(`<html><head><title>Application ${item.id}</title><style>body{font-family:sans-serif;padding:32px;color:#102a43}h1{color:#047857}table{border-collapse:collapse;width:100%}td,th{border:1px solid #cbd5e1;padding:8px;text-align:left}</style></head><body><h1>${type === "birth" ? "Birth Registration Application" : "Death Registration Application"}</h1><table><tr><th>Application No</th><td>${item.id}</td></tr><tr><th>Registration No</th><td>${item.regNo ?? "—"}</td></tr><tr><th>Name</th><td>${L(item.name?.bn ?? "", item.name?.en ?? "")}</td></tr><tr><th>Father</th><td>${L(item.father?.bn ?? "", item.father?.en ?? "")}</td></tr><tr><th>Mother</th><td>${L(item.mother?.bn ?? "", item.mother?.en ?? "")}</td></tr><tr><th>Village / Ward / Post Office</th><td>${found ? L(found.v.bn, found.v.en) : "—"} / Ward ${n(item.ward)} / ${found ? L(found.v.poBn, found.v.poEn) : "—"}</td></tr><tr><th>Status</th><td>${item.status}</td></tr></table></body></html>`);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const summaryCards = [
    { key: "all", label: L("সর্বমোট", "Total"), value: counts.total, Icon: ClipboardCheck, tone: "bg-slate-100 text-slate-700" },
    { key: "pending", label: L("অপেক্ষমাণ", "Pending"), value: counts.pending, Icon: Clock3, tone: "bg-amber-100 text-amber-700" },
    { key: "progress", label: L("প্রক্রিয়াধীন", "Processing"), value: counts.progress, Icon: Filter, tone: "bg-blue-100 text-blue-700" },
    { key: "completed", label: L("অনুমোদিত", "Approved"), value: counts.completed, Icon: CheckCircle2, tone: "bg-emerald-100 text-emerald-700" },
    { key: "rejected", label: L("বাতিল", "Rejected"), value: counts.rejected, Icon: XCircle, tone: "bg-red-100 text-red-700" },
  ] as const;

  return (
    <section className="mx-auto w-full max-w-none space-y-4 pb-4">
      <header className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-teal-50 p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">{L("ইউপি সচিব প্রশাসনিক প্যানেল", "UP Secretary Administrative Panel")}</p>
            <h1 className="mt-1 font-display text-xl font-bold text-emerald-950 sm:text-2xl">
              {type === "birth" ? L("জন্ম নিবন্ধন আবেদন তালিকা", "Birth Registration Application List") : L("মৃত্যু নিবন্ধন আবেদন তালিকা", "Death Registration Application List")}
            </h1>
          </div>
          <Button type="button" variant="outline" onClick={() => onHome?.()}><Home className="mr-2 h-4 w-4" />{L("ড্যাশবোর্ড", "Dashboard")}</Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {summaryCards.map(({ key, label, value, Icon, tone }) => (
          <button key={key} type="button" onClick={() => { setStatus(key === "all" ? "all" : key as Status); setPage(1); }} className={`rounded-xl border p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${status === key || (key === "all" && status === "all") ? "border-emerald-500 ring-2 ring-emerald-100" : "border-slate-200 bg-white"}`}>
            <div className="flex items-center justify-between"><span className={`rounded-lg p-2 ${tone}`}><Icon className="h-4 w-4" /></span><b className="text-xl text-slate-900">{n(value)}</b></div>
            <p className="mt-2 text-sm font-bold text-slate-700">{label}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:flex-row">
        <label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input className="pl-9" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={L("নাম বা আবেদন নম্বর দিয়ে খুঁজুন", "Search by name or application ID")} /></label>
        <Select value={status} onValueChange={(value) => { setStatus(value as "all" | Status); setPage(1); }}><SelectTrigger className="w-full md:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{L("সব অবস্থা", "All statuses")}</SelectItem><SelectItem value="pending">{L("অপেক্ষমাণ", "Pending")}</SelectItem><SelectItem value="progress">{L("প্রক্রিয়াধীন", "Processing")}</SelectItem><SelectItem value="completed">{L("অনুমোদিত", "Approved")}</SelectItem><SelectItem value="rejected">{L("বাতিল", "Rejected")}</SelectItem></SelectContent></Select>
        <Select value={ward} onValueChange={(value) => { setWard(value); setPage(1); }}><SelectTrigger className="w-full md:w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{L("সব ওয়ার্ড", "All wards")}</SelectItem>{wards.map((item) => <SelectItem key={item} value={String(item)}>{L(`ওয়ার্ড ${n(item)}`, `Ward ${item}`)}</SelectItem>)}</SelectContent></Select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1500px] text-left text-sm">
          <thead className="bg-emerald-50 text-xs font-bold text-emerald-950"><tr>{["ক্রমিক নং", "আবেদন নং ও নিবন্ধন নম্বর", "নাম", "জন্ম/মৃত্যুর তারিখ", "পিতা ও মাতার নাম", "গ্রাম, ওয়ার্ড ও ডাকঘর", "স্ট্যাটাস", "সচিবের কার্যক্রম"].map((heading, index) => <th key={heading} className={`px-3 py-3 ${index === 7 ? "text-right" : ""}`}>{L(heading, ["Serial", "Application No. & Reg. No.", "Registered Person", type === "birth" ? "Date of Birth" : "Date of Death", "Father & Mother", "Village, Ward & Post Office", "Status", "Administrative Actions"][index] ?? heading)}</th>)}</tr></thead>
          <tbody>
            {visible.map((item, index) => {
              const found = findVillage(item.villageId);
              const serial = (currentPage - 1) * pageSize + index + 1;
              const assignedOfficer = state.users.find((candidate) => candidate.id === item.police?.assignedPoliceId);
              return (
                <tr key={item.id} className="border-t border-slate-100 hover:bg-emerald-50/40">
                  <td className="px-3 py-3 font-semibold tabular-nums">{n(serial)}</td>
                  <td className="px-3 py-3"><p className="font-mono text-xs font-bold">#{item.id.slice(0, 10).toUpperCase()}</p><p className="mt-1 text-xs text-slate-500">{item.regNo ? `${type === "birth" ? "BRN" : "DRN"}: ${item.regNo}` : L("নিবন্ধনবিহীন", "Not registered")}</p></td>
                  <td className="max-w-44 px-3 py-3"><p className="font-bold text-slate-900">{L(item.name?.bn ?? "—", item.name?.en ?? "—")}</p></td>
                  <td className="whitespace-nowrap px-3 py-3">{formatDate(type === "death" ? item.dod ?? item.dob : item.dob)}</td>
                  <td className="max-w-56 px-3 py-3"><p><span className="text-slate-400">{L("পিতা", "Father")}: </span>{L(item.father?.bn ?? "—", item.father?.en ?? "—")}</p><p className="mt-1"><span className="text-slate-400">{L("মাতা", "Mother")}: </span>{L(item.mother?.bn ?? "—", item.mother?.en ?? "—")}</p></td>
                  <td className="px-3 py-3"><p className="font-semibold">{found ? L(found.v.bn, found.v.en) : "—"}</p><p className="mt-1 text-xs text-slate-500">{L(`ওয়ার্ড ${n(item.ward)}`, `Ward ${item.ward}`)} · {found ? L(found.v.poBn, found.v.poEn) : "—"}</p></td>
                  <td className="px-3 py-3"><StatusBadge s={item.status} />{assignedOfficer && <p className="mt-1 text-xs text-slate-500">{L("পরিদর্শক", "Assigned")}: {L(assignedOfficer.name.bn, assignedOfficer.name.en)} · {n(item.police?.fieldVisitDays?.length ?? 0)}/4</p>}</td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-1.5 whitespace-nowrap">
                      <Button size="sm" variant="outline" onClick={() => setSelected(item)}><Eye className="mr-1 h-4 w-4" />{L("দেখুন", "View")}</Button>
                      <Button size="sm" variant="outline" onClick={() => printItem(item)}><Printer className="mr-1 h-4 w-4" />{L("প্রিন্ট", "Print")}</Button>
                      {item.status !== "completed" && item.status !== "rejected" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => { setAssignmentCase(item); setAssignmentPoliceId(item.police?.assignedPoliceId ?? ""); }}>
                            {L("পরিদর্শনে পাঠান", "Assign for Field Visit")}
                          </Button>
                          <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800" onClick={() => void approve(item)}><CheckCircle2 className="mr-1 h-4 w-4" />{L("সরাসরি অনুমোদন", "Direct Approval")}</Button>
                          <Button size="sm" variant="outline" className="border-red-200 text-red-700" onClick={() => void reject(item)}><ShieldAlert className="mr-1 h-4 w-4" />{L("বাতিল", "Reject")}</Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-500">{L("কোনো আবেদন পাওয়া যায়নি", "No applications found")}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between"><span className="text-xs text-slate-500">{n(filtered.length)} {L("টি আবেদন", "applications")}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="h-4 w-4" /></Button><Button size="sm" variant="outline" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}><ChevronRight className="h-4 w-4" /></Button></div></div>

      <Dialog open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null); }}><DialogContent className="max-h-[90svh] max-w-2xl overflow-y-auto border-emerald-200"><DialogHeader><DialogTitle>{L("আবেদন বিস্তারিত", "Application Details")}</DialogTitle><DialogDescription>{selected?.id}</DialogDescription></DialogHeader>{selected && <div className="grid gap-3 text-sm sm:grid-cols-2"><Detail label={L("নাম", "Name")} value={L(selected.name?.bn ?? "—", selected.name?.en ?? "—")}/><Detail label={L("আবেদন নম্বর", "Application No")} value={selected.id}/><Detail label={type === "birth" ? L("জন্ম তারিখ", "Date of Birth") : L("মৃত্যুর তারিখ", "Date of Death") } value={formatDate(type === "death" ? selected.dod ?? selected.dob : selected.dob)}/><Detail label={L("পিতা", "Father")} value={L(selected.father?.bn ?? "—", selected.father?.en ?? "—")}/><Detail label={L("মাতা", "Mother")} value={L(selected.mother?.bn ?? "—", selected.mother?.en ?? "—")}/><Detail label={L("অবস্থা", "Status")} value={<StatusBadge s={selected.status}/>}/><Detail label={L("নিবন্ধন নম্বর", "Registration No")} value={selected.regNo ?? L("নিবন্ধনবিহীন", "Not registered")}/>{(selected.police?.fieldVisitDays ?? []).map((visit) => <Detail key={visit.day} label={L(`পরিদর্শন দিন ${n(visit.day)}`, `Field visit day ${visit.day}`)} value={<div><p>{visit.latitude.toFixed(6)}, {visit.longitude.toFixed(6)}</p><p className="text-xs text-slate-500">{formatDate(visit.capturedAt)}</p><Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => void openVisitPhoto(selected, visit.day)}><Eye className="mr-1 h-4 w-4"/>{L("ছবি দেখুন", "View photo")}</Button></div>}/>)}</div>}</DialogContent></Dialog>
      <Dialog open={visitPhotoPreview !== null} onOpenChange={(open) => { if (!open) setVisitPhotoPreview(null); }}>
        <DialogContent className="max-h-[90svh] max-w-3xl border-emerald-200">
          <DialogHeader><DialogTitle>{visitPhotoPreview?.title}</DialogTitle></DialogHeader>
          {visitPhotoPreview && <img src={visitPhotoPreview.src} alt={visitPhotoPreview.title} className="max-h-[75svh] w-full rounded-lg object-contain" />}
        </DialogContent>
      </Dialog>
      <Dialog open={assignmentCase !== null} onOpenChange={(open) => { if (!open) setAssignmentCase(null); }}>
        <DialogContent className="max-w-lg border-emerald-200">
          <DialogHeader>
            <DialogTitle>{L("পরিদর্শনের জন্য গ্রামপুলিশ নির্ধারণ", "Assign a village police officer")}</DialogTitle>
            <DialogDescription>{assignmentCase?.id}</DialogDescription>
          </DialogHeader>
          {availablePolice.filter((candidate) => candidate.ward === assignmentCase?.ward).length ? (
            <div className="space-y-4">
              <Select value={assignmentPoliceId} onValueChange={setAssignmentPoliceId}>
                <SelectTrigger><SelectValue placeholder={L("গ্রামপুলিশ নির্বাচন করুন", "Select village police")} /></SelectTrigger>
                <SelectContent>
                  {availablePolice.filter((candidate) => candidate.ward === assignmentCase?.ward).map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>{L(candidate.name.bn, candidate.name.en)} · {L(`ওয়ার্ড ${n(candidate.ward ?? 0)}`, `Ward ${candidate.ward ?? "—"}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button className="w-full" disabled={!assignmentPoliceId} onClick={() => void assignForFieldVisit()}>
                {L("পরিদর্শনের জন্য পাঠান", "Assign for Field Visit")}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-amber-800">{L("এই ওয়ার্ডে সক্রিয় গ্রামপুলিশ পাওয়া যায়নি", "No active village police officer is available in this ward")}</p>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-semibold text-slate-900">{value}</p></div>;
}
