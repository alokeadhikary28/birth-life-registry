import { useEffect, useState, type FormEvent } from "react";
import { Check, ChevronLeft, ChevronRight, FilePlus2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MonitoringTargetEntry } from "@/components/dashboards/MonitoringTargetEntry";
import { MonitoringTargetOverview } from "@/components/dashboards/MonitoringTargetOverview";
import { MonitoringNoticeBoard } from "@/components/dashboards/MonitoringNoticeBoard";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useApp } from "@/lib/store";

type EntryField = { id: string; label: string; value: string };
type PageType = "notice" | "custom" | "targets";
type EntryPage = { id: string; pageNumber: number; pageType: PageType; title: string; entries: EntryField[] };
type PageRecord = {
  id: string;
  page_number: number;
  page_type: PageType;
  title: string;
  entries: Json;
  updated_at: string;
};
const DEMO_PAGES_KEY = "monitoring-entry-pages";
const DEFAULT_PAGES: Omit<EntryPage, "id">[] = [
  { pageNumber: 1, pageType: "notice", title: "নোটিশ বোর্ড", entries: [] },
  { pageNumber: 2, pageType: "custom", title: "পৃষ্ঠা ২", entries: [] },
  { pageNumber: 3, pageType: "custom", title: "পৃষ্ঠা ৩", entries: [] },
  { pageNumber: 4, pageType: "custom", title: "পৃষ্ঠা ৪", entries: [] },
  { pageNumber: 5, pageType: "targets", title: "জন্ম ও মৃত্যু নিবন্ধন টার্গেট এন্ট্রি", entries: [] },
];

function parseEntries(value: Json): EntryField[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
    const { id, label, value: entryValue } = item;
    return typeof id === "string" && typeof label === "string" && typeof entryValue === "string"
      ? [{ id, label, value: entryValue }]
      : [];
  });
}

  function parsePageType(value: string): PageType {
    return value === "notice" || value === "targets" ? value : "custom";
  }

function readDemoPages(userId: string): EntryPage[] {
  try {
    const stored = localStorage.getItem(`${DEMO_PAGES_KEY}:${userId}`);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    const pages = parsed.flatMap((page, index): EntryPage[] => {
      if (typeof page !== "object" || page === null || Array.isArray(page)) return [];
      const record = page as Record<string, unknown>;
      if (typeof record["id"] !== "string" || typeof record["title"] !== "string") return [];
      const entries = Array.isArray(record["entries"])
        ? record["entries"].flatMap((entry): EntryField[] => {
            if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
            const field = entry as Record<string, unknown>;
            return typeof field["id"] === "string" && typeof field["label"] === "string" && typeof field["value"] === "string"
              ? [{ id: field["id"], label: field["label"], value: field["value"] }]
              : [];
          })
        : [];
      const pageNumber = Number.isSafeInteger(record["pageNumber"]) && Number(record["pageNumber"]) > 0
        ? Number(record["pageNumber"])
        : index + DEFAULT_PAGES.length + 1;
      const pageType = record["pageType"] === "notice" || record["pageType"] === "targets"
        ? record["pageType"]
        : "custom";
      return [{ id: record["id"], pageNumber, pageType, title: record["title"], entries }];
    });
    const pageNumbers = new Set(pages.map((page) => page.pageNumber));
    const defaults = DEFAULT_PAGES
      .filter((page) => !pageNumbers.has(page.pageNumber))
      .map((page) => ({ ...page, id: crypto.randomUUID() }));
    return [...defaults, ...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  } catch (error) {
    console.error("Failed to read demo monitoring pages", error);
    return [];
  }
}

function writeDemoPages(userId: string, pages: EntryPage[]) {
  try {
    localStorage.setItem(`${DEMO_PAGES_KEY}:${userId}`, JSON.stringify(pages));
    return true;
  } catch (error) {
    console.error("Failed to save demo monitoring pages", error);
    return false;
  }
}

export function MonitoringWorkspace() {
  const { L, demoMode, user } = useApp();
  const canManagePages = user && ["uno", "district", "super"].includes(user.role);
  const [pages, setPages] = useState<EntryPage[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [dirtyPageIds, setDirtyPageIds] = useState<string[]>([]);
  const [renamingPageId, setRenamingPageId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [pagesLoadError, setPagesLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (!canManagePages) {
      const noticePage: EntryPage = {
        id: "notice-board",
        pageNumber: 1,
        pageType: "notice",
        title: "নোটিশ বোর্ড",
        entries: [],
      };
      setPages([noticePage]);
      setActivePageId(noticePage.id);
      setDirtyPageIds([]);
      setPagesLoadError(false);
      setLoading(false);
      return;
    }
    if (demoMode) {
      const demoPages = readDemoPages(user.id);
      writeDemoPages(user.id, demoPages);
      setPages(demoPages);
      setActivePageId(demoPages.find((page) => page.pageNumber === 1)?.id ?? null);
      setDirtyPageIds([]);
      setPagesLoadError(false);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setPagesLoadError(false);

    void (async () => {
      const { data, error } = await supabase
        .from("monitoring_entry_pages")
        .select("id, page_number, page_type, title, entries, updated_at")
        .eq("owner_id", user.id)
        .order("page_number", { ascending: true });

      if (!active) return;
      if (error) {
        console.error("Failed to load monitoring entry pages", error);
        toast.error(L("ডেটা এন্ট্রি পৃষ্ঠা লোড করা যায়নি", "Could not load data entry pages"));
        setPages([]);
        setActivePageId(null);
        setPagesLoadError(true);
      } else {
        const existingPages = (data ?? []) as PageRecord[];
        const existingNumbers = new Set(existingPages.map((page) => page.page_number));
        const missingDefaults = DEFAULT_PAGES
          .filter((page) => !existingNumbers.has(page.pageNumber))
          .map((page) => ({
            owner_id: user.id,
            page_number: page.pageNumber,
            page_type: page.pageType,
            title: page.title,
            entries: page.entries as Json,
          }));
        if (missingDefaults.length) {
          const { error: seedError } = await supabase
            .from("monitoring_entry_pages")
            .upsert(missingDefaults, { onConflict: "owner_id,page_number", ignoreDuplicates: true });
          if (seedError) {
            console.error("Failed to prepare default monitoring pages", seedError);
            toast.error(L("প্রাথমিক পৃষ্ঠা তৈরি করা যায়নি", "Could not prepare default pages"));
            setPagesLoadError(true);
          }
        }
        const { data: refreshedData, error: refreshError } = missingDefaults.length
          ? await supabase
              .from("monitoring_entry_pages")
              .select("id, page_number, page_type, title, entries, updated_at")
              .eq("owner_id", user.id)
              .order("page_number", { ascending: true })
          : { data, error: null };
        if (refreshError) {
          console.error("Failed to reload default monitoring pages", refreshError);
          toast.error(L("ডেটা এন্ট্রি পৃষ্ঠা লোড করা যায়নি", "Could not load data entry pages"));
          setPagesLoadError(true);
        }
        const loadedPages = ((refreshedData ?? existingPages) as PageRecord[]).map((page) => ({
          id: page.id,
          pageNumber: page.page_number,
          pageType: parsePageType(page.page_type),
          title: page.title,
          entries: parseEntries(page.entries),
        }));
        setPages(loadedPages);
        setActivePageId((current) => current && loadedPages.some((page) => page.id === current)
          ? current
          : loadedPages.find((page) => page.pageNumber === 1)?.id ?? null);
      }
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [L, canManagePages, demoMode, reloadKey, user]);

  const activePage = pages.find((page) => page.id === activePageId) ?? null;

  const createPage = async () => {
    if (!user || !canManagePages || creating) return;
    if (demoMode) {
      const page: EntryPage = {
        id: crypto.randomUUID(),
        pageNumber: Math.max(0, ...pages.map((item) => item.pageNumber)) + 1,
        pageType: "custom",
        title: L("নতুন পৃষ্ঠা", "New page"),
        entries: [],
      };
      const nextPages = [...pages, page].sort((a, b) => a.pageNumber - b.pageNumber);
      if (!writeDemoPages(user.id, nextPages)) {
        toast.error(L("নতুন পৃষ্ঠা তৈরি করা যায়নি", "Could not create a new page"));
        return;
      }
      setPages(nextPages);
      setActivePageId(page.id);
      toast.success(L("নতুন পৃষ্ঠা তৈরি হয়েছে", "New page created"));
      return;
    }

    setCreating(true);
    const { data, error } = await supabase
      .from("monitoring_entry_pages")
      .insert({
        owner_id: user.id,
        page_number: Math.max(0, ...pages.map((page) => page.pageNumber)) + 1,
        page_type: "custom",
        title: L("নতুন পৃষ্ঠা", "New page"),
        entries: [] as Json,
      })
      .select("id, page_number, page_type, title, entries, updated_at")
      .single();
    setCreating(false);

    if (error) {
      console.error("Failed to create monitoring entry page", error);
      toast.error(L("নতুন পৃষ্ঠা তৈরি করা যায়নি", "Could not create a new page"));
      return;
    }

    const page: EntryPage = {
      id: data.id,
      pageNumber: data.page_number,
      pageType: parsePageType(data.page_type),
      title: data.title,
      entries: parseEntries(data.entries),
    };
    setPages((current) => [...current, page].sort((a, b) => a.pageNumber - b.pageNumber));
    setActivePageId(page.id);
    toast.success(L("নতুন পৃষ্ঠা তৈরি হয়েছে", "New page created"));
  };

  const beginRename = (page: EntryPage) => {
    setRenamingPageId(page.id);
    setRenameValue(page.title);
  };

  const renamePage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = renameValue.trim();
    if (!user || !renamingPageId || !title || renaming) return;
    if (demoMode) {
      const nextPages = pages.map((page) =>
        page.id === renamingPageId ? { ...page, title } : page,
      );
      if (!writeDemoPages(user.id, nextPages)) {
        toast.error(L("পৃষ্ঠা পুনঃনামকরণ করা যায়নি", "Could not rename the page"));
        return;
      }
      setPages(nextPages);
      setRenamingPageId(null);
      toast.success(L("পৃষ্ঠার নাম পরিবর্তন হয়েছে", "Page renamed"));
      return;
    }

    setRenaming(true);
    const { error } = await supabase
      .from("monitoring_entry_pages")
      .update({ title, updated_at: new Date().toISOString() })
      .eq("id", renamingPageId)
      .eq("owner_id", user.id);
    setRenaming(false);

    if (error) {
      console.error("Failed to rename monitoring entry page", error);
      toast.error(L("পৃষ্ঠা পুনঃনামকরণ করা যায়নি", "Could not rename the page"));
      return;
    }

    setPages((current) => current.map((page) =>
      page.id === renamingPageId ? { ...page, title } : page,
    ));
    setRenamingPageId(null);
    toast.success(L("পৃষ্ঠার নাম পরিবর্তন হয়েছে", "Page renamed"));
  };

  const updateEntry = (entryId: string, field: "label" | "value", value: string) => {
    if (!activePage) return;
    setPages((current) => current.map((page) => page.id === activePage.id
      ? {
          ...page,
          entries: page.entries.map((entry) => entry.id === entryId
            ? { ...entry, [field]: value }
            : entry),
        }
      : page,
    ));
    setDirtyPageIds((current) => current.includes(activePage.id) ? current : [...current, activePage.id]);
  };

  const addEntry = () => {
    if (!activePage) return;
    setPages((current) => current.map((page) => page.id === activePage.id
      ? {
          ...page,
          entries: [...page.entries, { id: crypto.randomUUID(), label: "", value: "" }],
        }
      : page,
    ));
    setDirtyPageIds((current) => current.includes(activePage.id) ? current : [...current, activePage.id]);
  };

  const removeEntry = (entryId: string) => {
    if (!activePage) return;
    setPages((current) => current.map((page) => page.id === activePage.id
      ? { ...page, entries: page.entries.filter((entry) => entry.id !== entryId) }
      : page,
    ));
    setDirtyPageIds((current) => current.includes(activePage.id) ? current : [...current, activePage.id]);
  };

  const savePage = async () => {
    if (!user || !activePage || saving) return;
    if (demoMode) {
      if (!writeDemoPages(user.id, pages)) {
        toast.error(L("পৃষ্ঠা সংরক্ষণ করা যায়নি", "Could not save the page"));
        return;
      }
      setDirtyPageIds((current) => current.filter((id) => id !== activePage.id));
      toast.success(L("পৃষ্ঠা সংরক্ষণ হয়েছে", "Page saved"));
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("monitoring_entry_pages")
      .update({ entries: activePage.entries as Json, updated_at: new Date().toISOString() })
      .eq("id", activePage.id)
      .eq("owner_id", user.id);
    setSaving(false);

    if (error) {
      console.error("Failed to save monitoring entry page", error);
      toast.error(L("পৃষ্ঠা সংরক্ষণ করা যায়নি", "Could not save the page"));
      return;
    }

    setDirtyPageIds((current) => current.filter((id) => id !== activePage.id));
    toast.success(L("পৃষ্ঠা সংরক্ষণ হয়েছে", "Page saved"));
  };

  return (
    <div
      className={`flex h-full min-h-0 w-full flex-1 flex-col ${
        user?.role === "super" ? "super-admin-monitoring" : ""
      }`}
    >
      {pagesLoadError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 sm:px-5"
        >
          <p className="text-sm leading-6">
            {L(
              "পর্যবেক্ষণ পৃষ্ঠা লোড/প্রস্তুত করা যায়নি। MFA সেশন, RLS এবং 0019–0020 migration যাচাই করুন।",
              "Monitoring pages could not be loaded or prepared. Verify the MFA session, RLS, and migrations 0019–0020.",
            )}
          </p>
          <Button
            type="button"
            variant="outline"
            className="h-10 text-base"
            disabled={loading}
            onClick={() => setReloadKey((key) => key + 1)}
          >
            {L("আবার চেষ্টা করুন", "Retry")}
          </Button>
        </div>
      )}
      <div className={`grid min-h-0 flex-1 grid-cols-1 overflow-hidden bg-white transition-[grid-template-columns] duration-200 ease-out motion-reduce:transition-none dark:bg-slate-900 ${sidebarCollapsed ? "md:grid-cols-[4rem_minmax(0,1fr)]" : "md:grid-cols-[16rem_minmax(0,1fr)]"}`}>
        <aside className={`flex min-h-0 flex-col border-b border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-950/30 md:border-b-0 md:border-r ${sidebarCollapsed ? "md:w-auto" : "md:w-64"}`}>
          <div className={`flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-3 dark:border-slate-700 ${sidebarCollapsed ? "md:flex-col md:px-2" : ""}`}>
            <h2 className={`text-sm font-bold ${sidebarCollapsed ? "md:hidden" : ""}`}>{L("ডেটা এন্ট্রি পৃষ্ঠা", "Data entry pages")}</h2>
            {canManagePages && <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label={L("নতুন পৃষ্ঠা তৈরি করুন", "Create new page")}
              title={L("নতুন পৃষ্ঠা", "New page")}
              disabled={creating}
              onClick={() => void createPage()}
            >
              <Plus className="h-4 w-4" />
            </Button>}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="hidden md:inline-flex"
              aria-label={sidebarCollapsed ? L("সাইডবার প্রসারিত করুন", "Expand sidebar") : L("সাইডবার ছোট করুন", "Collapse sidebar")}
              title={sidebarCollapsed ? L("সাইডবার প্রসারিত করুন", "Expand sidebar") : L("সাইডবার ছোট করুন", "Collapse sidebar")}
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            >
              {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
          </div>
          <nav aria-label={L("ডেটা এন্ট্রি পৃষ্ঠা তালিকা", "Data entry page list")} className={`min-h-0 flex-1 space-y-1 overflow-y-auto p-2 ${sidebarCollapsed ? "md:px-1" : ""}`}>
            {loading ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">{L("পৃষ্ঠা লোড হচ্ছে…", "Loading pages…")}</p>
            ) : pages.length ? pages.map((page) => (
              <div key={page.id} className={`flex items-center gap-1 rounded-md ${sidebarCollapsed ? "md:justify-center" : ""} ${activePageId === page.id ? "bg-emerald-100 dark:bg-emerald-950/50" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}>
                {renamingPageId === page.id ? (
                  <form className="flex min-w-0 flex-1 items-center gap-1 p-1" onSubmit={(event) => void renamePage(event)}>
                    <Input
                      autoFocus
                      aria-label={L("পৃষ্ঠার নতুন নাম", "New page name")}
                      className="h-8 min-w-0"
                      maxLength={120}
                      value={renameValue}
                      disabled={renaming}
                      onChange={(event) => setRenameValue(event.target.value)}
                    />
                    <Button type="submit" size="icon" variant="ghost" aria-label={L("নাম সংরক্ষণ", "Save name")} disabled={renaming || !renameValue.trim()}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" aria-label={L("বাতিল", "Cancel rename")} disabled={renaming} onClick={() => setRenamingPageId(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      className={`min-h-10 min-w-0 flex-1 truncate px-3 py-2 text-left text-sm font-medium ${sidebarCollapsed ? "md:flex-none md:px-1" : ""}`}
                      aria-current={activePageId === page.id ? "page" : undefined}
                      title={page.title}
                      onClick={() => setActivePageId(page.id)}
                    >
                      <span className={`mr-2 text-xs text-muted-foreground ${sidebarCollapsed ? "md:mr-0" : ""}`}>{L(`পাতা ${page.pageNumber}`, `Page ${page.pageNumber}`)}</span>
                      <span className={sidebarCollapsed ? "md:sr-only" : ""}>{page.title}</span>
                      {dirtyPageIds.includes(page.id) && <span className="ml-1 text-amber-700" aria-label={L("অসংরক্ষিত পরিবর্তন", "Unsaved changes")}>•</span>}
                    </button>
                    {canManagePages && <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className={`mr-1 h-8 w-8 shrink-0 ${sidebarCollapsed ? "md:hidden" : ""}`}
                      aria-label={`${L("পুনঃনামকরণ", "Rename")} ${page.title}`}
                      title={L("পুনঃনামকরণ", "Rename")}
                      onClick={() => beginRename(page)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>}
                  </>
                )}
              </div>
            )) : (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                {L("এখনও কোনো পৃষ্ঠা তৈরি হয়নি", "No pages created yet")}
              </p>
            )}
          </nav>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col">
          {activePage ? (
            <>
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700 sm:px-5">
                <h2 className="min-w-0 truncate text-lg font-semibold">{activePage.title}</h2>
                <Button type="button" size="sm" disabled={saving || !dirtyPageIds.includes(activePage.id)} onClick={() => void savePage()}>
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? L("সংরক্ষণ হচ্ছে…", "Saving…") : L("সংরক্ষণ করুন", "Save")}
                </Button>
              </header>
              {activePage.pageType === "notice" ? (
                <MonitoringNoticeBoard />
              ) : activePage.pageType === "targets" ? (
                <div className="min-h-0 flex-1 overflow-auto">
                  {user?.role === "uno" ? (
                    <MonitoringTargetEntry />
                  ) : (
                    <MonitoringTargetOverview />
                  )}
                </div>
              ) : (
              <div className="flex-1 overflow-auto p-4 sm:p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">
                    {L("প্রতিটি সারিতে একটি তথ্যের নাম ও মান লিখুন।", "Add a field name and value for each entry.")}
                  </p>
                  <Button type="button" size="sm" variant="outline" onClick={addEntry}>
                    <FilePlus2 className="mr-2 h-4 w-4" />
                    {L("তথ্য যোগ করুন", "Add entry")}
                  </Button>
                </div>
                {activePage.entries.length ? (
                  <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
                    <table className="w-full min-w-[34rem] text-sm">
                      <thead className="bg-slate-50 text-left dark:bg-slate-800">
                        <tr>
                          <th scope="col" className="w-16 px-3 py-2.5">{L("নং", "No.")}</th>
                          <th scope="col" className="px-3 py-2.5">{L("তথ্যের নাম", "Field name")}</th>
                          <th scope="col" className="px-3 py-2.5">{L("মান", "Value")}</th>
                          <th scope="col" className="w-14 px-2 py-2.5"><span className="sr-only">{L("অপসারণ", "Remove")}</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {activePage.entries.map((entry, index) => (
                          <tr key={entry.id} className="border-t border-slate-200 dark:border-slate-700">
                            <td className="px-3 py-2.5 tabular-nums">{index + 1}</td>
                            <td className="px-2 py-2">
                              <Input
                                aria-label={`${L("তথ্যের নাম", "Field name")} ${index + 1}`}
                                className="h-9"
                                maxLength={160}
                                value={entry.label}
                                onChange={(event) => updateEntry(entry.id, "label", event.target.value)}
                              />
                            </td>
                            <td className="px-2 py-2">
                              <Input
                                aria-label={`${L("মান", "Value")} ${index + 1}`}
                                className="h-9"
                                maxLength={1000}
                                value={entry.value}
                                onChange={(event) => updateEntry(entry.id, "value", event.target.value)}
                              />
                            </td>
                            <td className="px-2 py-2">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                aria-label={`${L("তথ্য অপসারণ", "Remove entry")} ${index + 1}`}
                                onClick={() => removeEntry(entry.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex min-h-48 flex-col items-center justify-center border-y border-dashed border-slate-300 px-4 text-center dark:border-slate-700">
                    <p className="text-sm text-muted-foreground">{L("এই পৃষ্ঠায় এখনো কোনো তথ্য নেই।", "This page has no entries yet.")}</p>
                    <Button type="button" variant="ghost" className="mt-2" onClick={addEntry}>
                      <Plus className="mr-2 h-4 w-4" />{L("প্রথম তথ্য যোগ করুন", "Add the first entry")}
                    </Button>
                  </div>
                )}
              </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-5 py-12 text-center">
              <h2 className="text-lg font-semibold">{L("একটি ডেটা এন্ট্রি পৃষ্ঠা বেছে নিন", "Select a data entry page")}</h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                {L("নতুন পৃষ্ঠা তৈরি করতে বাম পাশের + বোতাম ব্যবহার করুন।", "Use the + button in the sidebar to create a page.")}
              </p>
              {!pages.length && !loading && (
                <Button type="button" className="mt-4" disabled={creating} onClick={() => void createPage()}>
                  <Plus className="mr-2 h-4 w-4" />{L("নতুন পৃষ্ঠা", "New page")}
                </Button>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}