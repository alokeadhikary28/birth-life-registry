import { useEffect, useState, type FormEvent } from "react";
import { Megaphone, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/store";

type NoticeKind = "notice" | "message" | "directive";
type Notice = {
  id: string;
  upazila_id: string;
  union_id: string | null;
  author_id: string;
  title: string;
  body: string;
  kind: NoticeKind;
  published_at: string;
};

const DEMO_NOTICES_KEY = "monitoring-notices";
const noticeKinds: NoticeKind[] = ["notice", "message", "directive"];

function readDemoNotices(upazilaId: string): Notice[] {
  try {
    const stored = localStorage.getItem(`${DEMO_NOTICES_KEY}:${upazilaId}`);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is Notice =>
          typeof item === "object" &&
          item !== null &&
          "id" in item &&
          typeof item.id === "string" &&
          "upazila_id" in item &&
          typeof item.upazila_id === "string" &&
          "union_id" in item &&
          (typeof item.union_id === "string" || item.union_id === null) &&
          "author_id" in item &&
          typeof item.author_id === "string" &&
          "title" in item &&
          typeof item.title === "string" &&
          "body" in item &&
          typeof item.body === "string" &&
          "kind" in item &&
          noticeKinds.includes(item.kind as NoticeKind) &&
          "published_at" in item &&
          typeof item.published_at === "string",
      )
      .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
  } catch (error) {
    console.error("Failed to read demo monitoring notices", error);
    return [];
  }
}

function readAllDemoNotices(): Notice[] {
  const noticeKeys = Object.keys(localStorage).filter((key) =>
    key.startsWith(`${DEMO_NOTICES_KEY}:`),
  );
  return noticeKeys
    .flatMap((key) => readDemoNotices(key.slice(DEMO_NOTICES_KEY.length + 1)))
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
}

function writeDemoNotices(upazilaId: string, notices: Notice[]) {
  try {
    localStorage.setItem(`${DEMO_NOTICES_KEY}:${upazilaId}`, JSON.stringify(notices));
    return true;
  } catch (error) {
    console.error("Failed to save demo monitoring notices", error);
    return false;
  }
}

export function MonitoringNoticeBoard() {
  const { L, demoMode, state, user } = useApp();
  const upazilaId = user?.upazilaId;
  const unionId = user?.role === "admin" ? (user.unionId ?? null) : null;
  const isGlobalViewer = user?.role === "district" || user?.role === "super";
  const isSuperAdmin = user?.role === "super";
  const canPublish = user?.role === "uno" || user?.role === "admin" || isSuperAdmin;
  const [notices, setNotices] = useState<Notice[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<NoticeKind>("notice");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [publishUpazilaId, setPublishUpazilaId] = useState(state.upazilas[0]?.id ?? "");
  const publishScopeUpazilaId = isSuperAdmin ? publishUpazilaId : upazilaId;

  useEffect(() => {
    if (!publishUpazilaId && state.upazilas[0]) {
      setPublishUpazilaId(state.upazilas[0].id);
    }
  }, [publishUpazilaId, state.upazilas]);

  useEffect(() => {
    if (!upazilaId && !isGlobalViewer) {
      setNotices([]);
      setLoadError(false);
      setLoading(false);
      return;
    }
    if (demoMode) {
      setNotices(isGlobalViewer ? readAllDemoNotices() : readDemoNotices(upazilaId!));
      setLoadError(false);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setLoadError(false);
    void (async () => {
      try {
        let noticeQuery = supabase
          .from("monitoring_notices")
          .select("id, upazila_id, union_id, author_id, title, body, kind, published_at")
          .order("published_at", { ascending: false });
        if (!isGlobalViewer) noticeQuery = noticeQuery.eq("upazila_id", upazilaId!);
        const { data, error } = await noticeQuery;
        if (!active) return;
        if (error) throw error;
        setNotices((data ?? []) as Notice[]);
      } catch (error) {
        if (!active) return;
        console.error("Failed to load monitoring notices", error);
        setNotices([]);
        setLoadError(true);
        toast.error(L("নোটিশ বোর্ড লোড করা যায়নি", "Could not load the notice board"));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [L, demoMode, isGlobalViewer, reloadKey, upazilaId]);

  const visibleNotices = notices.filter(
    (notice) =>
      isGlobalViewer ||
      (notice.upazila_id === upazilaId &&
        (notice.union_id === null || notice.union_id === user?.unionId || user?.role === "uno")),
  );

  const publishNotice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanTitle = title.trim();
    const cleanBody = body.trim();
    if (!user || !publishScopeUpazilaId || !canPublish || publishing) return;
    if (!cleanTitle || !cleanBody) {
      toast.error(L("শিরোনাম ও বার্তা লিখুন", "Enter a title and message"));
      return;
    }
    setPublishing(true);
    const notice: Notice = {
      id: crypto.randomUUID(),
      upazila_id: publishScopeUpazilaId,
      union_id: unionId,
      author_id: user.id,
      title: cleanTitle,
      body: cleanBody,
      kind,
      published_at: new Date().toISOString(),
    };

    try {
      if (demoMode) {
        const nextNotices = [notice, ...readDemoNotices(publishScopeUpazilaId)];
        if (!writeDemoNotices(publishScopeUpazilaId, nextNotices)) {
          throw new Error("Local notice save failed");
        }
      } else {
        const { data, error } = await supabase
          .from("monitoring_notices")
          .insert({
            upazila_id: notice.upazila_id,
            union_id: notice.union_id,
            author_id: notice.author_id,
            title: notice.title,
            body: notice.body,
            kind: notice.kind,
          })
          .select("id, upazila_id, union_id, author_id, title, body, kind, published_at")
          .single();
        if (error) throw error;
        setNotices((current) => [data as Notice, ...current]);
      }
      if (demoMode) setNotices((current) => [notice, ...current]);
      setLoadError(false);
      setTitle("");
      setBody("");
      setKind("notice");
      toast.success(L("নোটিশ সফলভাবে প্রকাশিত হয়েছে", "Notice published successfully"));
    } catch (error) {
      console.error("Failed to publish monitoring notice", error);
      toast.error(L("নোটিশ প্রকাশ করা যায়নি", "Could not publish the notice"));
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {canPublish && (
        <form
          className="grid gap-4 border-b border-slate-200 p-4 dark:border-slate-700 sm:p-5"
          onSubmit={(event) => void publishNotice(event)}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-xl font-semibold leading-8">
              {L("অফিসিয়াল নোটিশ প্রকাশ", "Publish an official notice")}
            </h3>
            <span className="text-sm leading-6 text-muted-foreground">
              {user?.role === "admin"
                ? L("শুধু নিজ ইউনিয়নের কর্মকর্তারা দেখবেন", "Visible to your union only")
                : isSuperAdmin
                  ? L(
                      "নির্বাচিত উপজেলার কর্মকর্তারা দেখবেন",
                      "Visible throughout the selected Upazila",
                    )
                  : L("উপজেলার সব কর্মকর্তা দেখবেন", "Visible throughout your Upazila")}
            </span>
          </div>
          {isSuperAdmin && (
            <label className="space-y-1.5 text-base font-medium leading-7">
              {L("নোটিশের উপজেলা", "Notice Upazila")}
              <Select value={publishUpazilaId} onValueChange={setPublishUpazilaId}>
                <SelectTrigger
                  aria-label={L("নোটিশের উপজেলা নির্বাচন", "Select notice Upazila")}
                  className="h-11 text-base"
                >
                  <SelectValue placeholder={L("উপজেলা বেছে নিন", "Choose an Upazila")} />
                </SelectTrigger>
                <SelectContent>
                  {state.upazilas.map((upazila) => (
                    <SelectItem key={upazila.id} className="text-base" value={upazila.id}>
                      {L(
                        `${upazila.bn}, ${upazila.districtBn}`,
                        `${upazila.en}, ${upazila.districtEn}`,
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          )}
          <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
            <label className="space-y-1.5 text-base font-medium leading-7">
              {L("ধরন", "Type")}
              <select
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-base"
                value={kind}
                onChange={(event) => setKind(event.target.value as NoticeKind)}
              >
                <option value="notice">{L("নোটিশ", "Notice")}</option>
                <option value="message">{L("বার্তা", "Message")}</option>
                <option value="directive">{L("নির্দেশনা", "Directive")}</option>
              </select>
            </label>
            <label className="space-y-1.5 text-base font-medium leading-7">
              {L("শিরোনাম", "Title")}
              <Input
                className="h-11 text-base md:text-base"
                maxLength={180}
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
          </div>
          <label className="space-y-1.5 text-base font-medium leading-7">
            {L("বিস্তারিত বার্তা", "Message")}
            <Textarea
              className="text-base leading-7 md:text-base"
              maxLength={5000}
              required
              rows={3}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </label>
          <div className="flex justify-end">
            <Button
              type="submit"
              className="h-11 text-base"
              disabled={publishing || !publishScopeUpazilaId || !title.trim() || !body.trim()}
            >
              <Send className="mr-2 h-4 w-4" />
              {publishing ? L("প্রকাশ হচ্ছে…", "Publishing…") : L("প্রকাশ করুন", "Publish")}
            </Button>
          </div>
        </form>
      )}

      <section
        className="min-h-0 flex-1 px-4 py-3 sm:px-5"
        aria-label={L("প্রকাশিত নোটিশ", "Published notices")}
      >
        <h3 className="mb-3 text-lg font-semibold leading-7 text-slate-700 dark:text-slate-200">
          {L("প্রকাশিত নোটিশ", "Published notices")}
        </h3>
        {loading ? (
          <p className="py-5 text-base leading-7 text-muted-foreground">
            {L("নোটিশ লোড হচ্ছে…", "Loading notices…")}
          </p>
        ) : loadError ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-950"
          >
            <p className="flex items-center gap-2 text-base leading-7">
              <Megaphone className="size-5 shrink-0" aria-hidden="true" />
              {L(
                "নোটিশ লোড করা যায়নি। 0021–0022 migration, MFA সেশন ও RLS যাচাই করুন।",
                "Could not load notices. Verify migrations 0021–0022, the MFA session, and RLS.",
              )}
            </p>
            <Button
              type="button"
              variant="outline"
              className="h-10 text-base"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              {L("আবার চেষ্টা করুন", "Retry")}
            </Button>
          </div>
        ) : visibleNotices.length ? (
          <ol className="divide-y divide-slate-200 dark:divide-slate-700">
            {visibleNotices.map((notice) => {
              const area = state.upazilas.find((item) => item.id === notice.upazila_id);
              const union = area?.unions.find((item) => item.id === notice.union_id);
              return (
                <li key={notice.id} className="py-4 first:pt-2 sm:py-5">
                  <article>
                    <div className="flex flex-wrap items-center gap-2">
                      <Megaphone
                        className="h-4 w-4 text-emerald-700 dark:text-emerald-300"
                        aria-hidden="true"
                      />
                      <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                        {L(
                          notice.kind === "directive"
                            ? "নির্দেশনা"
                            : notice.kind === "message"
                              ? "বার্তা"
                              : "নোটিশ",
                          notice.kind === "directive"
                            ? "Directive"
                            : notice.kind === "message"
                              ? "Message"
                              : "Notice",
                        )}
                      </span>
                      {isGlobalViewer && (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {area
                            ? L(
                                `${area.bn}${union ? ` · ${union.bn}` : ""}`,
                                `${area.en}${union ? ` · ${union.en}` : ""}`,
                              )
                            : notice.upazila_id}
                        </span>
                      )}
                      <time
                        className="text-sm text-muted-foreground"
                        dateTime={notice.published_at}
                      >
                        {new Intl.DateTimeFormat(L("bn-BD", "en-GB"), {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: "Asia/Dhaka",
                        }).format(new Date(notice.published_at))}
                      </time>
                    </div>
                    <h4 className="mt-2 text-lg font-semibold leading-7 text-slate-950 dark:text-white">
                      {notice.title}
                    </h4>
                    <p className="mt-1 whitespace-pre-wrap text-base leading-7 text-slate-700 dark:text-slate-200">
                      {notice.body}
                    </p>
                  </article>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="border-y border-dashed border-slate-200 py-8 text-center text-base leading-7 text-muted-foreground dark:border-slate-700">
            {L("এখনো কোনো নোটিশ প্রকাশিত হয়নি", "No notices have been published yet")}
          </p>
        )}
      </section>
    </div>
  );
}
