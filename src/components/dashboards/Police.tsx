import { useState } from "react";
import { toast } from "sonner";
import { Home, CheckCircle2, MapPin, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/compress-image";
import { scopedCases, useApp } from "@/lib/store";
import type { FieldVisitDay } from "@/lib/types";
import { PageTitle, useCaseHelpers } from "../shared";
import { UnifiedStationDashboardTop } from "./UnifiedStationDashboardTop";

export function PoliceDashboard() {
  const { L, n, user, state, patchCase, demoMode, activeUnionId } = useApp();
  const { address } = useCaseHelpers();
  const scoped = scopedCases(state, user);
  const visitCases = scoped.filter(
    (item) =>
      item.police?.assignedPoliceId === user?.id &&
      item.status !== "completed" &&
      item.status !== "rejected",
  );
  const tasks = scoped.filter((item) => !item.police?.assignedPoliceId && item.police);
  const open = tasks.filter((c) => !c.police?.collected);
  const [visitPhotos, setVisitPhotos] = useState<Record<string, File>>({});
  const [uploadingVisit, setUploadingVisit] = useState<string | null>(null);
  const stationId = user
    ? demoMode
      ? activeUnionId ?? user.stationId ?? user.unionId
      : user.stationId ?? user.unionId
    : undefined;

  const captureCoordinates = () =>
    new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error(L("এই ডিভাইসে GPS পাওয়া যায়নি", "GPS is unavailable on this device")));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
        (error) => reject(new Error(error.message || L("GPS লোকেশন পাওয়া যায়নি", "Could not capture GPS location"))),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    });

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read photo"));
      reader.onerror = () => reject(reader.error ?? new Error("Could not read photo"));
      reader.readAsDataURL(file);
    });

  const submitVisitDay = async (item: (typeof visitCases)[number], day: FieldVisitDay["day"]) => {
    const file = visitPhotos[`${item.id}:${day}`];
    if (!file || !user) return;
    const key = `${item.id}:${day}`;
    setUploadingVisit(key);
    let uploadedPath: string | undefined;
    const cleanupUpload = async () => {
      if (!uploadedPath) return;
      const { error } = await supabase.storage.from("case-files").remove([uploadedPath]);
      if (error) console.error("Could not remove unreferenced field visit photo", error);
    };
    try {
      const currentDays = item.police?.fieldVisitDays ?? [];
      if (currentDays.length !== day - 1) {
        throw new Error(L("পরিদর্শনের ধাপের ক্রম পরিবর্তিত হয়েছে; তালিকা রিফ্রেশ করুন", "Visit sequence changed; refresh the application list"));
      }
      const dhakaDate = (value: Date) =>
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Dhaka",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(value);
      const previousVisit = currentDays.at(-1);
      if (previousVisit && dhakaDate(new Date()) <= dhakaDate(new Date(previousVisit.capturedAt))) {
        throw new Error(L("পরবর্তী দিনের পরিদর্শন আগামী ক্যালেন্ডার দিনে জমা দিন", "Submit each next visit on a later calendar day"));
      }
      const photo = await compressImage(file);
      const coordinates = await captureCoordinates();
      const capturedAt = new Date().toISOString();
      let photoData: FieldVisitDay["photo"];
      if (demoMode) {
        photoData = { name: photo.name, size: photo.size, dataUrl: await fileToDataUrl(photo) };
      } else {
        const path = `${user.upazilaId}/${user.unionId}/${item.id}/field-visit-day-${day}-${crypto.randomUUID()}-${photo.name.replace(/[^\w.-]+/g, "_").slice(-60)}`;
        const { error } = await supabase.storage.from("case-files").upload(path, photo, { contentType: photo.type });
        if (error) throw new Error(error.message);
        uploadedPath = path;
        photoData = { name: photo.name, size: photo.size, path };
      }

      const saved = await patchCase(item.id, {
        police: {
          ...(item.police ?? {}),
          fieldVisitDays: [...currentDays, { day, capturedAt, ...coordinates, photo: photoData }],
        },
      });
      if (!saved) {
        await cleanupUpload();
        return;
      }
      setVisitPhotos((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      toast.success(L(`দিন ${n(day)}-এর পরিদর্শন সংরক্ষিত হয়েছে`, `Day ${day} visit evidence saved`));
    } catch (cause) {
      await cleanupUpload();
      const message = cause instanceof Error ? cause.message : String(cause);
      toast.error(L(`পরিদর্শন সংরক্ষণ করা যায়নি: ${message}`, `Could not save field visit: ${message}`));
    } finally {
      setUploadingVisit(null);
    }
  };

  return (
    <>
      <div className="mx-auto mb-6 max-w-6xl">
        <UnifiedStationDashboardTop headerStationId={stationId} />
      </div>
      <div className="mx-auto max-w-xl">
        <PageTitle title={L("আমার পরিদর্শন আবেদন", "My Field Visit Applications")} sub={L(`নির্ধারিত ${n(visitCases.length)}টি · ওয়ার্ড ${n(user!.ward ?? 1)}`, `${visitCases.length} assigned · Ward ${user!.ward}`)} />
        {visitCases.length > 0 && (
          <div className="mb-6 space-y-4">
            {visitCases.map((item) => {
              const days = item.police?.fieldVisitDays ?? [];
              const nextDay = days.length < 4 ? (days.length + 1) as FieldVisitDay["day"] : null;
              return (
                <article key={item.id} className="rounded-2xl border border-emerald-200 bg-card p-4 shadow-sm">
                  <h2 className="text-lg font-bold">{L(item.name.bn, item.name.en)}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{address(item)}</p>
                  <p className="text-sm">{item.type === "birth" ? L("জন্ম নিবন্ধন", "Birth registration") : L("মৃত্যু নিবন্ধন", "Death registration")}</p>
                  <div className="mt-3 space-y-2">
                    {[1, 2, 3, 4].map((value) => {
                      const day = value as FieldVisitDay["day"];
                      const evidence = days.find((entry) => entry.day === day);
                      const isNextDay = day === nextDay;
                      const photoKey = `${item.id}:${day}`;
                      return (
                        <div key={day} className={`rounded-lg border p-3 ${evidence ? "border-emerald-300 bg-emerald-50" : isNextDay ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
                          <p className="font-semibold">{L(`দিন ${n(day)}`, `Day ${day}`)}{evidence && <span className="ml-2 text-emerald-700">{L("সম্পন্ন", "Complete")}</span>}</p>
                          {evidence ? (
                            <p className="mt-1 flex items-center gap-1 text-sm text-slate-600"><MapPin className="h-4 w-4" />{evidence.latitude.toFixed(6)}, {evidence.longitude.toFixed(6)} · {new Intl.DateTimeFormat(L("bn-BD", "en-GB"), { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" }).format(new Date(evidence.capturedAt))}</p>
                          ) : isNextDay ? (
                            <div className="mt-2 space-y-2">
                              <Input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="h-auto min-h-12 text-base"
                                aria-label={L(`দিন ${n(day)}-এর ছবি`, `Day ${day} photo`)}
                                onChange={(event) => {
                                  const selectedFile = event.currentTarget.files?.[0];
                                  if (selectedFile) setVisitPhotos((current) => ({ ...current, [photoKey]: selectedFile }));
                                }}
                              />
                              <Button
                                type="button"
                                className="min-h-12 w-full"
                                disabled={!visitPhotos[photoKey] || uploadingVisit !== null}
                                onClick={() => void submitVisitDay(item, day)}
                              >
                                <Upload className="mr-2 h-4 w-4" />
                                {uploadingVisit === photoKey ? L("ছবি ও GPS সংরক্ষণ হচ্ছে…", "Saving photo and GPS…") : L("ছবি ও GPS জমা দিন", "Submit photo and GPS")}
                              </Button>
                            </div>
                          ) : (
                            <p className="mt-1 text-sm text-slate-500">{L("আগের দিনের ধাপ সম্পন্ন হলে এটি চালু হবে", "Available after completing the previous day")}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {days.length === 4 && <p className="mt-3 font-semibold text-emerald-800">{L("চার দিনের পরিদর্শন সম্পন্ন; প্রশাসনিক অনুমোদনের অপেক্ষায়", "Four-day visit complete; awaiting administrative approval")}</p>}
                </article>
              );
            })}
          </div>
        )}
        {tasks.length > 0 && <h2 className="mb-3 text-lg font-semibold">{L("অন্যান্য নির্ধারিত কাজ", "Other assigned tasks")}</h2>}
        <div className="space-y-3">
          {tasks.map((c) => {
            const p = c.police!;
            const toggle = (k: "epiCard" | "parentNid") => void patchCase(c.id, { police: { ...p, [k]: !p[k] } });
            return (
              <div key={c.id} className={`rounded-2xl border p-4 ${p.collected ? "border-success/50 bg-success/10" : "border-border bg-card"}`}>
                <div className="flex items-start gap-3">
                  <Home className="mt-1 h-5 w-5 text-primary" />
                  <div className="flex-1">
                    <div className="text-lg font-semibold">{L(c.father.bn, c.father.en)}{L("-এর বাড়ি", "'s house")}</div>
                    <div className="text-sm text-muted-foreground">{address(c)}</div>
                    <div className="text-sm">{c.type === "birth" ? L("শিশু", "Child") : L("মৃত", "Deceased")}: {L(c.name.bn, c.name.en)}</div>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {([["epiCard", L("ইপিআই কার্ড", "EPI Card")], ["parentNid", L("পিতা/মাতার NID", "Parent NID")]] as const).map(([k, lbl]) => (
                    <label key={k} className="flex items-center gap-3 rounded-lg border border-border p-3 text-base">
                      <Checkbox checked={p[k] ?? false} disabled={p.collected ?? false} onCheckedChange={() => toggle(k)} className="h-6 w-6" />{lbl}
                    </label>
                  ))}
                </div>
                {p.collected ? (
                  <div className="mt-3 flex items-center gap-2 font-medium text-success"><CheckCircle2 className="h-5 w-5" />{L("সংগ্রহ সম্পন্ন", "Documents collected")}</div>
                ) : (
                  <Button size="lg" className="mt-3 h-14 w-full text-base" disabled={!p.epiCard || !p.parentNid}
                    onClick={async () => { if (!(await patchCase(c.id, { police: { ...p, collected: true, collectedAt: Date.now() } }))) return; toast.success(L("প্রশাসনিক কর্মকর্তাকে জানানো হয়েছে", "Admin notified")); }}>
                    {L("কাগজ সংগ্রহ সম্পন্ন", "Documents Collected")}
                  </Button>
                )}
              </div>
            );
          })}
          {!tasks.length && !visitCases.length && <p className="text-muted-foreground">{L("কোনো কাজ নির্ধারিত নেই", "No tasks assigned")}</p>}
        </div>
      </div>
    </>
  );
}
