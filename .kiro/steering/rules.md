---
mode: always_include
---

# Development Rules

Read all steering files first.

Always Use:
- Refer to the detailed Features building documented in .kiro/steering/product.md
- next-best-practices, web-design-guidelines, ui-ux-pro-max, tailwind-4-docs these 4 skills for this project
- DESIGN.md for this project design
- Refer to the detailed UX patterns documented in .kiro/steering/DESIGN.md

Never ask:
- Should I continue?
- Do you want me to proceed?

Continue automatically.

Use existing project structure.

No unnecessary folders.

No placeholder code.

No TODO comments.

Fix errors automatically.

Build production-ready code.

Complete entire feature before moving on.

Always Use:
- next-best-practices, web-design-guidelines, ui-ux-pro-max, tailwind-4-docs these 4 skills for this project
- DESIGN.md for this project design
- Refer to the detailed UX patterns documented in .kiro/steering/DESIGN.md


## Project Overview
A mobile-first Progressive Web App (PWA) for solo gym owners to manage members,
payments, WhatsApp communications, and business analytics. Built with Next.js,
MongoDB, and Tailwind CSS. Optimized for one-handed smartphone operation.

## Tech Stack
- **Framework:** Next.js 14+ (App Router)
- **Database:** MongoDB with Mongoose ODM
- **Styling:** Tailwind CSS + shadcn/ui components
- **Auth:** Custom JWT via HttpOnly cookies + 6-digit PIN system
- **Charts:** Recharts (client-side only, no DB load)
- **PWA:** next-pwa for installability and offline shell
- **WhatsApp:** Native deep links (wa.me) - zero cost
- **File Generation:** Client-side VCF generation via Blob API
- **Deployment:** Vercel (recommended)

# SYSTEM INITIALIZATION & PROJECT SPECIFICATION
Role: Senior Full-Stack Architect & Mobile-UI Engineer
Project: Solo Gym Operator SaaS ("The Paper Register Killer")
Target Environment: Mobile Web Browsers (PWA Optimized, Single-Thumb Navigation)
Infrastructure Cost Target: 0 Rupees (Free Tier Stack Forever)
Primary Philosophy: Value Over Friction. Eliminate unnecessary data entry. Speed is the only metric that drives adoption.

---

## 🛠️ THE CORE TECH STACK (100% FREE TIER FOREVER)
- Framework: Next.js (App Router with Serverless API routes)
- Database: MongoDB Atlas (Free M0 Sandbox Tier) via Mongoose ORM
- Styling: Tailwind CSS (Mobile-First, Responsive) + shadcn/ui components
- Icons: Lucide React Icons
- Authentication: NextAuth.js (Credentials Provider via JWT & Secure HttpOnly Cookies)
- Security: bcryptjs (PIN encryption)
- Visualizations: Recharts or Chart.js (Calculated purely Client-Side to save CPU cycles)
- Mobile Wrapper: next-pwa (Progressive Web App engine for installable Home Screen launch)

---

## 🔑 ARCHITECTURE & SECURITY: 1-CLICK AUTHENTICATION FLOW
The gym is run by a single, solo owner. There are no trainers or receptionists. Avoid traditional multi-tenant sign-up forms. 

### First-Launch Logic:
- On app launch, a middleware or initialization API route checks if an 'Admin' collection document exists in MongoDB.
- IF NO ADMIN EXISTS: Route to a clean, single-screen onboarding page. Ask for "Gym Name" and "Create 6-Digit App PIN". Hash the PIN using bcryptjs and save the admin document.
- IF ADMIN EXISTS: Immediately serve a mobile-first lock screen showing a sleek numerical keypad (0-9) to input the 6-Digit PIN.

### Session Persistence:
- Validate the PIN using bcrypt.compare against MongoDB.
- On success, drop a secure, `HttpOnly`, 30-day JWT token via NextAuth.
- The owner should only need to input this PIN once every 30 days unless they clear their cache. App must open directly to the dashboard instantly.

---

## 📱 CORE FEATURES (SPECIFIC FUNCTIONAL REQUIREMENT)

### 1. The Pocket Dashboard (The Core)
- State Tracking: Calculate member status dynamically on the frontend using their `expiryDate` compared to the current system date. Do not run heavy Cron jobs.
- The UI: A unified, single-screen list containing 3 filterable tab buckets at the top:
  1. 🔴 EXPIRED (CRITICAL): Members whose plans have ended. Must display most recent expirations at the top.
  2. 🟡 EXPIRING SOON: Members whose plans will expire within the next 3 days.
  3. 🟢 ACTIVE: Everyone else currently in the clear.
- Global Fast Search: A persistent, fixed-top search bar. Typing 2 letters instantly screens the list via client-side filter array logic.
- 1-Tap Quick Renewal: Next to every name, place a highly visible "Renew Plan" button. Tapping it triggers a clean drawer/modal containing options for +1 Month, +3 Months, or +6 Months. Tapping an option updates the MongoDB `expiryDate` field instantly and records the payment.

### 2. Retention & Sales Tools
- The 7-Day M.I.A. (Missing in Action) Alarm:
  - Logic: Filter the active array for any member whose `expiryDate` is less than or equal to `(Current Date - 7 days)` AND whose status is still unpaid.
  - Action: This view exposes members who have allowed their plans to sit lapsed for a full week without renewing. It acts as a primary safety net to catch churn before they drop out.
- The Walk-In "Lead Catcher":
  - Data Structure: A separate, isolated Mongoose collection called `Leads`. Fields: `name`, `phone`, `inquiryDate`, `status` ('Pending', 'Converted', 'Dead').
  - Logic: If a lead has a `status` of 'Pending' and the `inquiryDate` is older than 48 hours, highlight the card in Amber/Orange.
  - Upgrade Flow: Provide a "Convert to Member" button. Clicking this copies the name and phone number directly into a new Member registration state, saving time.

### 3. Zero-Cost WhatsApp Communication Engine
- Zero API Dependencies: Do not use Twilio or Meta Business APIs. Every messaging tool must use native URL string deep-linking via the browser (`https://wa.me/{phone}?text={message}`).
- One-Click WhatsApp Nudges: Place a crisp WhatsApp button directly next to any card in the Expired, Expiring Soon, M.I.A., or Leads view. Tapping it opens their native WhatsApp mobile app with a personalized, contextual string completely pre-filled (e.g., "Hey Rahul, your membership ended a week ago...").
- Instant Digital Payment Receipts:
  - Immediately following a Renewal transaction, display an interactive popup: "Send WhatsApp Receipt".
  - Tapping this formats a plain text block directly in the client browser using emojis and markdown symbols for bolding (*Text*), outputting a highly professional digital receipt straight to the user's WhatsApp input screen.

### 4. 1-Tap Broadcast Contact Generator
- Problem Solver: WhatsApp Broadcasts require numbers to be locally saved in the sender's device. The owner cannot type 500 contacts manually.
- Implementation: Provide a button labeled "Export Contacts to Phonebook". 
- Behind the Scenes: Write client-side vanilla JS that compiles all active user names and phones into a compliant `.vcf` (vCard) text string block. Trigger an instant browser blob download named `Gym_Active_Contacts.vcf`. Opening this file natively on Android immediately imports all 500 contacts safely as "Name (Gym)".

### 5. Client-Side Analytics (Zero-Database Overhead)
- Performance Rule: Fetch the raw array from MongoDB once. Execute all statistical arrays on the client via `array.reduce()` or mapping functions to keep backend computing under the free serverless timeout thresholds.
- Charts to Include (using Recharts / Chart.js):
  - Monthly Revenue Trend: A simple vertical bar chart displaying cash flow collection aggregates grouped by month.
  - Conversion vs Churn Ratio: A minimal donut/pie chart visual mapping active paying files against total historic entries.

---

## 🛑 EXPLICIT SCOPE BOUNDARIES (WHAT NOT TO BUILD)
To maintain peak system speed, lightweight storage compliance, and 0-rupee maintenance overhead, strictly enforce these exclusions:
- NO Member Login/App (This is 100% internal tool architecture for the solo owner).
- NO Daily Check-in system, QR door codes, or attendance time-logging tables.
- NO Supplement sales tracker, credit ledger, or Khata books.
- NO Workout logging, exercise metrics, or macro/diet builder screens.
- NO Payment gateway integrations. Assume all income is direct physical cash or personal UPI QR code scans.

---

## 🎨 UI/UX DESIGN & MOBILE CONFIGURATION POLICIES
- The app must behave exactly like a native Android utility wrapper. Avoid long scroll regions on the dashboard; use viewport relative positioning (`h-screen`, `overflow-y-auto`).
- Use smooth transitions (`framer-motion`) when components render or screens slide, mimicking a native mobile platform navigation stack.
- Configure next-pwa to ensure a clean manifest configuration: `display: "standalone"`, `orientation: "portrait"`, with appropriate system maskable splash icons so that it locks natively onto an Android home screen without displaying a web browser address bar.
- Build clean, bold dark UI themes natively optimized to handle bright glare inside fitness facilities while maintaining minimal screen battery drainage.

---

