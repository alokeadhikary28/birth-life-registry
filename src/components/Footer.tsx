import { Link } from "@tanstack/react-router";
import { Landmark, Mail, Phone } from "lucide-react";
import { useApp } from "@/lib/store";

export function Footer({ compact = false }: { compact?: boolean }) {
  const { L } = useApp();

  if (compact) {
    return (
      <footer className="min-h-16 w-full shrink-0 border-t border-emerald-700 bg-gradient-to-r from-[#70c158] to-[#5cb84b] py-1 text-white shadow-[0_-8px_24px_-20px_rgba(15,23,42,0.4)]">
        <div className="mx-auto flex min-h-14 w-full max-w-none flex-col items-center justify-center gap-1 px-4 text-xs leading-tight max-[360px]:text-[10px] sm:flex-row sm:justify-between sm:gap-3 sm:px-6 sm:text-sm lg:px-8">
          <p className="flex shrink-0 items-center gap-1.5 whitespace-nowrap font-display font-semibold">
            <Landmark className="h-3.5 w-3.5 shrink-0 text-emerald-100" aria-hidden="true" />
            <span>{L("ই-নিবন্ধন ট্র্যাকার", "E-Registration Tracker")}</span>
            <span className="font-sans text-emerald-100">© {L("২০২৬", "2026")}</span>
          </p>
          <nav
            aria-label={L("দ্রুত লিংক ও সহায়তা", "Quick links and help")}
            className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-emerald-50 sm:justify-end sm:gap-x-4"
          >
            <Link to="/dashboard" className="hover:text-white focus-visible:underline">
              {L("ড্যাশবোর্ড", "Dashboard")}
            </Link>
            <Link
              to="/dashboard/$section"
              params={{ section: "unions" }}
              className="hover:text-white focus-visible:underline"
            >
              {L("প্রতিবেদন", "Reports")}
            </Link>
            <span className="text-emerald-100">{L("গোপনীয়তা নীতি", "Privacy Policy")}</span>
            <Link
              to="/dashboard/$section"
              params={{ section: "compliance" }}
              className="font-medium text-white hover:text-emerald-100 focus-visible:underline"
            >
              {L("আইন ও সহায়তা · ৩৬৫ দিন", "Legal & Help · 365 Days")}
            </Link>
          </nav>
        </div>
      </footer>
    );
  }

  return (
    <footer className="border-t border-slate-800 bg-slate-950 text-slate-100">
      <div className="mx-auto grid w-full max-w-none gap-7 px-4 py-8 sm:px-6 md:grid-cols-[1.2fr_1fr_1fr] lg:px-8">
        <div>
          <div className="flex items-center gap-2 font-display text-lg font-semibold">
            <Landmark className="h-6 w-6 text-teal-300" aria-hidden="true" />
            {L("ই-নিবন্ধন ট্র্যাকার", "E-Nibondhon Tracker")}
          </div>
          <p className="mt-2 max-w-sm text-base leading-relaxed text-slate-300">
            {L(
              "জন্ম ও মৃত্যু নিবন্ধনে ৩৬৫ দিনের আইনি সময়সীমা মেনে জাতীয় অগ্রগতি পর্যবেক্ষণ করুন।",
              "Monitor nationwide progress under the 365-day birth and death registration mandate.",
            )}
          </p>
        </div>

        <nav aria-label={L("দ্রুত লিংক", "Quick links")}>
          <h2 className="text-lg font-semibold">{L("দ্রুত লিংক", "Quick links")}</h2>
          <ul className="mt-2 space-y-2 text-base text-slate-300">
            <li>
              <Link
                to="/"
                className="inline-flex min-h-8 items-center hover:text-white focus-visible:underline"
              >
                {L("হোম", "Home")}
              </Link>
            </li>
            <li>
              <Link
                to="/dashboard"
                className="inline-flex min-h-8 items-center hover:text-white focus-visible:underline"
              >
                {L("ড্যাশবোর্ড", "Dashboard")}
              </Link>
            </li>
          </ul>
        </nav>

        <div>
          <h2 className="text-lg font-semibold">{L("সহায়তা যোগাযোগ", "Support contact")}</h2>
          <p className="mt-1 text-base text-slate-300">
            {L(
              "জাতীয় নিবন্ধন আইসিটি / প্রশাসনিক সহায়তা",
              "National registration ICT / Administrative support",
            )}
          </p>
          <ul className="mt-2 space-y-2 text-base">
            <li>
              <a
                className="inline-flex min-h-8 items-center gap-2 text-slate-200 hover:text-white focus-visible:underline"
                href="tel:+8801700000000"
              >
                <Phone className="h-5 w-5 text-teal-300" aria-hidden="true" />
                <span>+880 1700-000000</span>
              </a>
            </li>
            <li>
              <a
                className="inline-flex min-h-8 items-center gap-2 break-all text-slate-200 hover:text-white focus-visible:underline"
                href="mailto:ict@upazila.gov.bd"
              >
                <Mail className="h-5 w-5 shrink-0 text-teal-300" aria-hidden="true" />
                <span>ict@upazila.gov.bd</span>
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-800">
        <div className="mx-auto w-full max-w-none px-4 py-3 text-sm text-slate-400 sm:px-6 lg:px-8">
          © {new Date().getFullYear()}{" "}
          {L(
            "ই-নিবন্ধন ট্র্যাকার · জাতীয় নিবন্ধন ব্যবস্থা",
            "E-Nibondhon Tracker · National Registration System",
          )}
          <span className="float-right">{L("সংস্করণ ১.০.০", "Version 1.0.0")}</span>
        </div>
      </div>
    </footer>
  );
}
