# Birth Death Connect

Project Name: Universal Upazila E-Registration Tracking System (Ultimate Multi-Tenant Architecture)
Description:
Create a secure, modern, multi-tenant web application to ensure 100% birth and death registration targets. The interface must feature a global, sticky Header containing theme, language, and navigation controls. The application supports 4 distinct user roles with dedicated responsive dashboards, dual login methods, automated smart features, and role-based data restrictions.
Global Header & Navigation Layout:
The web application must include a persistent, clean global Header at the top of all pages containing the following items:
1. Home Button / Logo: Navigates back to the main landing page.
2. Language Toggle Button: Instantly switches the entire application interface between বাংলা (Bengali) and English.
3. Theme Toggle Button: Switches the system UI seamlessly between Light Mode and Dark Mode.
4. Login Panel Button / User Profile Dropdown: Displays the Login options if unauthenticated (with a "Forgot Password" reset function for password users), or shows the logged-in user's name, role, and a Logout button if authenticated.
5. Helpdesk / Manual Button: Opens a modal showcasing the step-by-step User Manual for different roles.
6. Contact Support Button: Quick links to reach the Upazila ICT/Administrative support team.
Scalable Multi-Upazila Architecture:
1. Super Admin Panel: Allows onboarding of any District and Upazila.
2. Dynamic Dropdown Engine: If Manirampur Upazila is selected, it must dynamically load its 1 Municipality and 17 Unions in exact order: মণিরামপুর পৌরসভা, ০১ নং রোহিতা, ০২ নং কাশিমনগর, ০৩ নং ভোজগাতি, ০৪ নং ঢাকুরিয়া, ০৫ নং হরিদাসকাটি, ০৬ নং মণিরামপুর, ০৭ নং খেদাপাড়া, ০৮ নং হরিহরনগর, ০৯ নং ঝাঁপা, ১০ নং মশ্বিমনগর, ১১ নং চালুয়াহাটি, ১২ নং শ্যামকুড়, ১৩ নং খানপুর, ১৪ নং দুর্বাডাঙ্গা, ১৫ নং কুলটিয়া, ১৬ নং নেহালপুর, ১৭ নং মনোহরপুর।
3. Strict Data Isolation: Data of one Upazila or Union must be completely invisible and inaccessible to users of another Upazila or Union.
Dual Login Options (Accessible via Header Login Button):
- Option A (Mobile & OTP): For field-level Health Workers and Village Police.
- Option B (Password Login): For Administrative Officers, UNOs, and Super Admins.
The system must automatically detect the user's role and route them to their specific dashboard upon authentication.
Strict Business Logic & Technical Protections:
1. Data Input Restriction: ONLY EPI/Health Workers can enter new data. Workers may correct only their own cases until final registration is completed; completed case inputs are locked. Administrative Officers, Village Police, and UNOs cannot enter cases or alter original worker inputs.
2. Duplicate Prevention: Use the Parent's NID for birth entries and Deceased's NID/Birth Certificate number for death entries as a unique constraint. Show instant validation errors for duplicates.
3. Offline Sync Capability: Enable local offline caching for Health Workers and Village Police; data should auto-sync once online.
4. System Audit Logs: Maintain an automated, invisible audit trail tracking timestamps and User IDs for all creations, status changes, or remark updates.
5. Storage Optimization: Keep attached document files for 90 days after the case changes to "Completed" with a valid Government Registration Number, then auto-purge files to save space, keeping text data intact.
6. Red Flags: If a Health Worker or Ward registers zero entries for 15 consecutive days, flag that section in Red on the UNO and Admin dashboards.
Bilingual Ultra-Simple Input Forms (Side-by-Side Bangla/English):
Fields must be displayed side-by-side (Bangla Box | English Box) to minimize effort for EPI/Health workers.
1. Birth Registration Form: Child's Name, Father's Name, Mother's Name, Parent's NID, active mobile, Gender, DOB, Order of Child, 3 image attachments compressed to 750 KB or less each, and Smart Auto-Address (Worker enters "Village Name" only; Post Office, Ward, Union, Upazila, District, Division, and Country auto-populate instantly in both languages).
2. Death Registration Form: Mirrors Birth Form layout but replaces Child's Name with "Deceased Person's Name", requires Deceased's NID, and adds "Date of Death" and "Cause of Death". Includes active mobile and 3 compressed image attachments.
4 Dedicated User Dashboards & Scope-Limited Reports:
1. EPI / Health Worker Dashboard: Single-screen responsive dashboard with modal entry/edit forms, own-case corrections before completion, local entry lists with officer alerts, EPI session attendance follow-up automatically matched to subsequent birth entries, 365-day urgency indicators, compressed photo uploads, simulated parent-SMS status, and CSV/PDF exports.
2. Administrative Officer Dashboard: Live feed of data/files from their Union, add remarks, update status (Pending, In Progress, Completed), input final Government Registration Number to close cases on system completion, trigger verification tasks to Ward's Village Police, display a progress bar tracking monthly targets (Births: 50, Deaths: 20 per union), and a 'Download Union Report' button.
3. Village Police Dashboard: Simplified mobile UI showing assigned houses in their Ward with a physical document checklist ([ ] EPI Card, [ ] Parent NID). Tap "Documents Collected" to instantly update the Admin view.
4. UNO Dashboard: Master view of all Unions within their upazila with analytical graphs tracking monthly targets, ability to add mandatory "UNO Remarks", and a 'Download Master Report' button.
Design Standards:
Completely mobile-responsive, modern, clean, multi-tenant capable, supporting seamless bilingual transitions and theme toggles from the global header.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://birth-life-registry.lovable.app

In local Vite development only, when Supabase URL/publishable-key settings or the server-only `SUPABASE_SERVICE_ROLE_KEY` are absent, the login dialog offers a **Direct Test Login** preview. It uses seeded demo data and browser-local application storage; it does not create an authenticated Supabase session or update the production database. This preview is disabled in production builds. To use the connected Supabase backend locally, configure `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in the server environment; never expose the service-role key through a `VITE_` variable.

The login dialog's **Register** tab accepts account requests from Health Workers and Gram Police. Applicants provide their full name, mobile number, role, and union; this only stores a request and does not create an auth account or password. A Super Admin/UNO provisions the account from **Approval Management** using the server-only Supabase Admin API, then the matching union's UP Administrative Officer approves or rejects the pending account. Approval activates the account; field staff then sign in by phone OTP. Public requests are limited to Manirampur's 17 unions and are rate-limited. Configure `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in the server environment for Supabase-backed registration; never expose the service-role key through a `VITE_` variable.

The public landing page's bilingual geographic filters provide five levels: division → district → upazila/city corporation → union/municipality → ward. The bundled upazila and local-area catalog is pinned to [iqbalhasandev/bangladesh-geo-json@28ba44c](https://github.com/iqbalhasandev/bangladesh-geo-json/tree/28ba44c344b72cfe4849f2dde75b98393c8316ae), whose union-level source is [SudipMHX/bd-apis](https://github.com/SudipMHX/bd-apis). It contains 8 divisions, 64 districts, 495 upazilas, 4,540 unions, and 328 pourashavas. Twelve city corporations and their ward-number ranges are overlaid in `src/lib/geography.ts`; the source catalog does not provide official city-corporation ward boundaries. Union/municipality ward numbers 1–9 follow the existing registration schema. Upstream MIT and ISC notices are in `src/lib/data/`.

## Core application modules

- `/dashboard` — role-based registration dashboard and module navigation.
- `/birth-entry` and `/death-entry` — the existing registration forms, available to health workers.
- `/review-list` — birth/death review tabs, searchable records, CSV export, printing, and administrative completion.
- `/approval-management` — union-scoped pending staff decisions, available only to UP Administrative Officers.
- `/correction-log` — super-admin-only field-level audit history; database row-level security and MFA remain authoritative.
- `/monitoring` — executive compliance monitoring and UNO notice publishing.

## Monthly registration targets

Monthly birth and death targets are stored in `registration_targets`, keyed by Upazila, union/municipality, month, and draft/submitted status. UNOs can edit the full union list for their assigned Upazila from their dashboard; saving is performed by authenticated server functions, and database RLS plus the MFA gate enforce the same scope independently. Union-secretary dashboards load only the submitted target for the signed-in secretary's assigned union and current Bangladesh month. Their progress card compares those targets with that union's monthly registration cases.

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/39cec6a2-955c-4059-b4fc-6b11d67c973a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

`npm run build` creates the Nitro deployment output in `.output`. To preview a
local production build with Vite, run `npm run preview`; it first creates the
Vite-compatible SSR output in `dist` and then starts the preview server.

## Supabase setup

Copy `.env.example` to `.env` and configure the project URL and publishable key
for both the browser (`VITE_` variables) and server. Server functions also
require `SUPABASE_SERVICE_ROLE_KEY` for trusted admin operations such as OTP
lookups and sign-in rate limiting. Keep that key in local/deployment secrets:
never add a `VITE_` prefix or commit its value. `LOVABLE_DB_MIGRATION_URL` is a
separate privileged database connection used only by Drizzle migrations; do not
use it as an application runtime variable.

Birth and death registrations share the RLS-protected `public.cases` table and
are distinguished by its `type` column. Existing migrations define
role/jurisdiction-scoped case policies, worker and police submission policies,
and restrictive MFA policies for privileged roles. The app also requires a
private `case-files` Storage bucket; existing Storage policies scope uploads by
role and administrative area and reads to visible cases.

Before applying migrations to a connected project, reconcile migration status:
`drizzle/migrations/meta/_journal.json` currently ends at `0011`, while SQL
files `0012` and `0013` are present but absent from that journal. Confirm which
SQL has already been applied in the target database first; do not blindly run
the migration directory against production. Live RLS and Storage behavior must
be verified against the connected Supabase project after its deployment
secrets and migration history are confirmed.
