# Master Prompt (Logic & Functionality Only)

```
You are an expert full-stack developer. Build a complete production-ready
web app called "Gym Manager Pro" for a solo gym owner. This is a
mobile-first PWA built with Next.js 14 App Router, MongoDB with Mongoose,
Tailwind CSS, and shadcn/ui.

═══════════════════════════════════════════════════════════════════
                         TECH STACK
═══════════════════════════════════════════════════════════════════

- Next.js 14+ App Router
- MongoDB Atlas + Mongoose ODM
- Tailwind CSS + shadcn/ui
- bcryptjs for PIN hashing
- jsonwebtoken for JWT
- date-fns for all date math
- lucide-react for icons
- Recharts for charts (dynamic import only)
- Zod for API input validation
- SWR for client-side data fetching
- next-pwa for PWA support
- Native fetch() for HTTP calls

═══════════════════════════════════════════════════════════════════
                      ENVIRONMENT VARIABLES
═══════════════════════════════════════════════════════════════════

MONGODB_URI=mongodb+srv://...
JWT_SECRET=minimum-32-character-secret-string
JWT_EXPIRY=30d
NEXT_PUBLIC_APP_NAME=Gym Manager Pro

═══════════════════════════════════════════════════════════════════
                       DATABASE SCHEMAS
═══════════════════════════════════════════════════════════════════

--- Admin ---
gymName:   String, required, trim
pinHash:   String, required
createdAt: Date, default now
updatedAt: Date, default now

Only ONE admin document ever exists in this collection.

--- Member ---
name:             String, required, trim
phone:            String, required, unique
planDurationDays: Number, required
planStartDate:    Date, required
planEndDate:      Date, required
status:           String, enum [active, expiring, expired], default active
address:          String, default empty
notes:            String, default empty
miaFlagged:       Boolean, default false
isDeleted:        Boolean, default false
joinDate:         Date, default now
createdAt:        Date, default now
updatedAt:        Date, default now

MongoDB indexes: phone (unique), status, planEndDate

--- Payment ---
memberId:         ObjectId, ref Member, required
memberName:       String, required
memberPhone:      String, required
amount:           Number, required
paymentMethod:    String, enum [Cash, UPI], required
paymentDate:      Date, default now
planDurationDays: Number, required
previousExpiry:   Date
newExpiry:        Date, required
receiptText:      String
createdAt:        Date, default now

MongoDB indexes: memberId, paymentDate

--- Lead ---
name:              String, required, trim
phone:             String, required
interest:          String, default empty
source:            String, enum [walk-in, referral, social, other],
                   default walk-in
notes:             String, default empty
convertedToMember: Boolean, default false
convertedMemberId: ObjectId, ref Member, default null
createdAt:         Date, default now
updatedAt:         Date, default now

MongoDB index: createdAt

═══════════════════════════════════════════════════════════════════
                    FILE STRUCTURE
═══════════════════════════════════════════════════════════════════

gym-manager/
├── .env.local
├── next.config.js
├── tailwind.config.js
├── middleware.js
├── public/
│   └── manifest.json
├── app/
│   ├── layout.js
│   ├── page.js
│   ├── globals.css
│   ├── (auth)/
│   │   ├── setup/page.js
│   │   └── login/page.js
│   ├── (dashboard)/
│   │   ├── layout.js
│   │   ├── dashboard/page.js
│   │   ├── members/
│   │   │   ├── page.js
│   │   │   ├── new/page.js
│   │   │   └── [id]/
│   │   │       ├── page.js
│   │   │       └── edit/page.js
│   │   ├── leads/page.js
│   │   └── analytics/page.js
│   └── api/
│       ├── auth/
│       │   ├── check/route.js
│       │   ├── setup/route.js
│       │   ├── login/route.js
│       │   └── logout/route.js
│       ├── members/
│       │   ├── route.js
│       │   ├── [id]/route.js
│       │   └── renew/[id]/route.js
│       ├── leads/
│       │   ├── route.js
│       │   └── [id]/route.js
│       └── analytics/route.js
├── components/
│   ├── auth/
│   │   ├── PinPad.jsx
│   │   └── PinDots.jsx
│   ├── dashboard/
│   │   ├── MemberCard.jsx
│   │   ├── StatusBadge.jsx
│   │   ├── SearchBar.jsx
│   │   └── MIAAlert.jsx
│   ├── members/
│   │   ├── MemberForm.jsx
│   │   ├── RenewalModal.jsx
│   │   ├── ReceiptGenerator.jsx
│   │   └── PaymentHistory.jsx
│   ├── leads/
│   │   ├── LeadCard.jsx
│   │   └── LeadForm.jsx
│   ├── analytics/
│   │   ├── RevenueBarChart.jsx
│   │   └── RetentionPieChart.jsx
│   ├── whatsapp/
│   │   ├── WhatsAppButton.jsx
│   │   └── BroadcastVCF.jsx
│   └── layout/
│       ├── BottomNav.jsx
│       ├── TopBar.jsx
│       └── LoadingSpinner.jsx
├── lib/
│   ├── mongodb.js
│   ├── auth.js
│   ├── dateUtils.js
│   └── receiptFormatter.js
├── models/
│   ├── Admin.js
│   ├── Member.js
│   ├── Payment.js
│   └── Lead.js
└── hooks/
    ├── useMembers.js
    ├── useLeads.js
    └── useAnalytics.js

═══════════════════════════════════════════════════════════════════
                     AUTHENTICATION LOGIC
═══════════════════════════════════════════════════════════════════

--- First Launch ---
1. app/page.js calls GET /api/auth/check on load
2. Response { adminExists: false } → redirect to /setup
3. /setup collects: gymName (text input) + 6-digit PIN (PinPad)
   + confirm PIN (PinPad again)
4. Validates: gymName not empty, PIN is exactly 6 digits,
   both PINs match
5. POST /api/auth/setup:
   - Reject if Admin document already exists
   - bcrypt.hash(pin, 12)
   - Save Admin document
   - Sign JWT → set HttpOnly cookie → redirect to /dashboard

--- Login ---
1. app/page.js → GET /api/auth/check → { adminExists: true }
2. middleware.js checks JWT cookie → missing or expired → /login
3. /login fetches gym name from DB to display on screen
4. User enters 6 digits on PinPad → auto-submits on 6th digit
5. POST /api/auth/login:
   - Find Admin document
   - bcrypt.compare(enteredPin, storedHash)
   - Match → sign JWT (30d) → HttpOnly cookie → redirect /dashboard
   - No match → return error → trigger shake animation on PinDots
   - Rate limit: 5 failed attempts per 15 minutes per IP

--- Session ---
Cookie name: gym_session
Cookie flags: HttpOnly, Secure (production), SameSite=Strict
JWT payload: { adminId, gymName, iat, exp }
Expiry: 30 days (user stays logged in for one month)

--- Logout ---
POST /api/auth/logout → delete cookie → redirect /login
Triggered by a logout option accessible from the top bar

--- middleware.js ---
Protected routes: /dashboard/*, /members/*, /leads/*,
                  /analytics/*, /api/members/*, /api/leads/*,
                  /api/analytics/*
Public routes: /login, /setup, /api/auth/*
Logic: Read JWT from cookie → verify → if invalid → redirect /login

═══════════════════════════════════════════════════════════════════
                    ALL API ROUTES
═══════════════════════════════════════════════════════════════════

Every API route returns this exact shape:
Success: { success: true, data: <payload> }
Error:   { success: false, error: "message", code: "SNAKE_CASE" }

Validate every POST and PUT body with Zod before touching DB.

--- GET /api/auth/check ---
No auth needed.
Logic: Admin.countDocuments() === 0 → adminExists: false
Returns: { adminExists: boolean }

--- POST /api/auth/setup ---
No auth needed. Fails if admin already exists.
Body: { gymName: string, pin: string }
Zod: gymName min 2 chars, pin exactly 6 numeric digit characters
Action: hash pin → save Admin → sign JWT → set cookie
Returns: { gymName }

--- POST /api/auth/login ---
Body: { pin: string }
Action: find Admin → bcrypt.compare → sign JWT → set cookie
Returns: { gymName }

--- POST /api/auth/logout ---
Action: clear gym_session cookie
Returns: { success: true }

--- GET /api/members ---
Auth required.
Query params:
  ?search=string  → case-insensitive regex on name and phone fields
  ?status=string  → filter by active, expiring, or expired
  ?page=number    → default 1
  ?limit=number   → default 50

Before returning each member RECOMPUTE status using this logic:
  today = start of current day
  threeDaysLater = today + 3 days
  if planEndDate < today → status = expired
  else if planEndDate <= threeDaysLater → status = expiring
  else → status = active

Also compute miaFlagged:
  if status === expired AND differenceInDays(today, planEndDate) >= 7
  → miaFlagged = true

Sort order: expired first (MIA members at top of expired),
            then expiring, then active.
Exclude isDeleted = true members.
Returns: { members: [], totalCount, page, totalPages }

--- POST /api/members ---
Auth required.
Body: { name, phone, planDurationDays, planStartDate, address, notes }
Zod: name required, phone 10+ digits, planDurationDays positive integer
Logic:
  - Strip non-digit characters from phone
  - planEndDate = addDays(planStartDate, planDurationDays)
  - Compute initial status
  - Save member
Returns: created member object

--- GET /api/members/[id] ---
Auth required.
Logic: Find member by id (not deleted) + find all Payment docs
       where memberId matches, sorted by paymentDate descending
Returns: { member, payments: [] }

--- PUT /api/members/[id] ---
Auth required.
Body: any subset of { name, phone, address, notes }
Cannot update planEndDate directly (use renew route)
Returns: updated member

--- DELETE /api/members/[id] ---
Auth required.
Logic: Set isDeleted = true (soft delete, never hard delete)
Returns: { success: true }

--- POST /api/members/renew/[id] ---
Auth required.
Body: { amount, paymentMethod, planDurationDays }
Zod: amount positive number, paymentMethod Cash or UPI,
     planDurationDays positive integer
Logic:
  1. Find member
  2. previousExpiry = member.planEndDate
  3. If member status is expired:
       newExpiry = addDays(today, planDurationDays)
       newStartDate = today
     Else (active or expiring):
       newExpiry = addDays(previousExpiry, planDurationDays)
       newStartDate = member.planStartDate
  4. Generate receiptText using receiptFormatter
  5. Create Payment document with all fields
  6. Update member: planEndDate, planDurationDays, planStartDate,
     recomputed status, updatedAt
  7. Save Payment first, then Member
Returns: { member, payment, receiptText }

--- GET /api/leads ---
Auth required.
Logic: Find all leads where convertedToMember = false,
       sorted by createdAt descending
For each lead compute: hoursOld = differenceInHours(now, createdAt)
Returns: { leads: [] } (each lead includes computed hoursOld)

--- POST /api/leads ---
Auth required.
Body: { name, phone, interest, source, notes }
Returns: created lead

--- PUT /api/leads/[id] ---
Auth required.
Body: any subset of lead fields, optionally:
  { convertedToMember: true, convertedMemberId: string }
Returns: updated lead

--- DELETE /api/leads/[id] ---
Auth required.
Hard delete (leads are disposable).
Returns: { success: true }

--- GET /api/analytics ---
Auth required.
Logic:
  Part 1 - Monthly Revenue (last 6 months):
    MongoDB aggregation on Payment collection:
    $match: paymentDate within last 6 months
    $group: by { year: $year, month: $month of paymentDate }
    $project: month label (e.g. "Jun 2026"), totalAmount, paymentCount
    Sort ascending by date
    
  Part 2 - Member stats:
    Run computeStatus on all non-deleted members
    Count: total, active, expiring, expired
    newThisMonth: members where joinDate is within current month

Returns:
{
  monthlyRevenue: [
    { month: "Jan 2026", totalAmount: 45000, paymentCount: 38 }
  ],
  memberStats: {
    total, active, expiring, expired, newThisMonth
  }
}

═══════════════════════════════════════════════════════════════════
                      LIB FILES LOGIC
═══════════════════════════════════════════════════════════════════

--- lib/mongodb.js ---
Use global variable pattern to cache Mongoose connection across
hot reloads in development. Export connectDB() async function.
Set bufferCommands: false, serverSelectionTimeoutMS: 5000.
Call connectDB() at the top of every API route handler.

--- lib/auth.js ---
Export these functions:
  signToken(payload)        → signs JWT with JWT_SECRET, 30d expiry
  verifyToken(token)        → returns decoded payload or null on error
  hashPin(pin)              → bcrypt.hash(pin, 12), returns promise
  comparePin(pin, hash)     → bcrypt.compare(pin, hash), returns promise

--- lib/dateUtils.js ---
Import everything from date-fns. Export:
  computeMemberStatus(planEndDate)
    → returns 'active', 'expiring', or 'expired'
    → expiring = within 3 days from today
    
  getDaysUntilExpiry(planEndDate)
    → positive number = days remaining
    → negative number = days since expiry
    
  isMIAMember(planEndDate)
    → true if expired for 7 or more days
    
  formatDisplayDate(date)
    → returns string in format "10-Jun-2026"
    
  getMonthLabel(date)
    → returns string in format "Jun 2026"

--- lib/receiptFormatter.js ---
Export: generateReceiptText(member, payment, gymName)
Must return this exact string (fill in real values):

🏋️‍♂️ *{gymName} - PAYMENT RECEIPT* 🏋️‍♂️
----------------------------------
👤 *Member Name:* {member.name}
📱 *Phone:* {member.phone}
📅 *Date:* {formatDisplayDate(payment.paymentDate)}
💰 *Amount Paid:* ₹{payment.amount}
💳 *Payment Mode:* {payment.paymentMethod}
⏱️ *Valid Until:* {formatDisplayDate(payment.newExpiry)}
----------------------------------
Thank you for your payment! Let's crush those goals! 💪🔥

═══════════════════════════════════════════════════════════════════
                   COMPONENT LOGIC
═══════════════════════════════════════════════════════════════════

--- PinPad.jsx ---
Props: { onComplete: function, loading: boolean }
Renders a 3x4 numeric grid: digits 1-9, blank, 0, backspace
Maintains internal state: currentPin (string, max 6 chars)
On each digit tap: append to currentPin
On backspace tap: remove last character
When currentPin.length reaches 6: call onComplete(currentPin)
While loading=true: disable all buttons

--- PinDots.jsx ---
Props: { filledCount: number, error: boolean }
Renders 6 indicator dots
filledCount dots are filled/solid, rest are empty/outline
When error=true: trigger shake animation on the dot row
After shake animation ends: reset error state via callback

--- MemberCard.jsx ---
Props: { member, onRenew, gymName }
Displays: name, computed status text, days remaining or days overdue,
          phone number
Shows Renew button only if status is expired or expiring
Shows WhatsApp button always
WhatsApp button builds wa.me deep link with pre-filled reminder text
based on member status (different message for expiring vs expired)
MIA members show an additional visual indicator

--- SearchBar.jsx ---
Props: { onSearch: function }
Controlled input with debounce of 300ms
Calls onSearch(value) after debounce
Shows clear button when input has text

--- MIAAlert.jsx ---
Props: { count: number, onPress: function }
Only renders when count > 0
Displays count of members missing for 7+ days
Tap triggers onPress (scrolls to MIA members in parent)

--- RenewalModal.jsx ---
Props: { member, gymName, onSuccess, onClose }
Internal state: amount (number), paymentMethod (Cash or UPI),
               planDurationDays (number), isSubmitting (boolean)

Amount input: number input, auto-focused on mount
PaymentMethod: two toggle buttons, Cash selected by default
PlanDuration: preset buttons [30, 60, 90, 180, 365] + custom number input
Preview: compute and display newExpiry in real time as user changes duration
  Logic: if member.status === expired → newExpiry = today + planDurationDays
         else → newExpiry = member.planEndDate + planDurationDays

On submit:
  - Validate: amount > 0, planDurationDays > 0
  - POST /api/members/renew/[id] with { amount, paymentMethod, planDurationDays }
  - On success: store returned receiptText in local state
  - Transition modal to show receipt + WhatsApp send button
  - WhatsApp button: wa.me/{phoneDigitsOnly}?text={encodeURIComponent(receiptText)}
  - Done button: call onSuccess() → parent refreshes member list

--- ReceiptGenerator.jsx ---
Props: { receiptText, phone }
Renders the formatted receipt text in a monospace-style box
Provides "Send via WhatsApp" button with correct deep link
Provides "Copy to Clipboard" button using navigator.clipboard.writeText

--- PaymentHistory.jsx ---
Props: { payments: [] }
Renders list of payment records sorted newest first
Each entry shows: date, amount, method, plan duration, new expiry
Tap entry → expands to show full receiptText with re-send WhatsApp button

--- MemberForm.jsx ---
Props: { initialData, onSubmit, isSubmitting }
Fields: name, phone, planDurationDays (chip selector + custom),
        planStartDate (date input, default today), address, notes
planEndDate preview: auto-calculates and displays as read-only
                     = planStartDate + planDurationDays days
Validates all fields before calling onSubmit(formData)

--- LeadCard.jsx ---
Props: { lead, onConvert, onDelete }
Computes locally: hoursOld = differenceInHours(now, lead.createdAt)
If hoursOld >= 48 AND not converted: mark card as needing follow-up
Shows: name, source, phone, time since created, interest, notes
Convert button: calls onConvert(lead) → parent navigates to /members/new
                with lead data pre-filled in query params
WhatsApp button: wa.me deep link with follow-up message
Delete button: confirms then calls onDelete(lead._id)

Follow-up WhatsApp message:
"Hi {name}! 👋 Thanks for visiting {gymName}!
We'd love to help you start your fitness journey.
Are you still interested in joining? We have great plans available.
Reply to this message and we'll get you started! 💪🏋️‍♂️"

--- LeadForm.jsx ---
Props: { onSubmit, isSubmitting }
Fields: name (required), phone (required),
        interest (chip selector: 1M / 2M / 3M / 6M / other),
        source (chip selector: Walk-in / Referral / Social / Other),
        notes (textarea)
Validates required fields before calling onSubmit(formData)

--- RevenueBarChart.jsx ---
Dynamic import only (no SSR).
Props: { data: [{ month, totalAmount, paymentCount }] }
Recharts BarChart with:
  XAxis: month labels
  YAxis: formatted rupee amounts
  Bar: totalAmount
  Tooltip: shows month, total amount, payment count
Renders empty state text if data array is empty

--- RetentionPieChart.jsx ---
Dynamic import only (no SSR).
Props: { active: number, expired: number }
Recharts PieChart with two slices: active and expired/churned
Center label showing retention percentage:
  retentionRate = Math.round((active / (active + expired)) * 100)
Renders empty state if both values are 0

--- BroadcastVCF.jsx ---
Props: { gymName }
Button that when clicked:
  1. Fetches GET /api/members?status=active&limit=1000
  2. Builds VCF string by concatenating for each member:
       BEGIN:VCARD
       VERSION:3.0
       FN:{member.name}
       TEL;TYPE=CELL:{member.phone}
       END:VCARD
  3. Creates Blob: new Blob([vcfString], { type: 'text/vcard' })
  4. Creates object URL and triggers download
  5. Filename: {gymName}-active-{YYYY-MM-DD}.vcf
  6. Shows instruction message after download:
     "File downloaded! In WhatsApp: New Broadcast → Add Recipients
      → select contacts from this file to send bulk messages."

--- WhatsAppButton.jsx ---
Props: { phone, message, label }
Builds: https://wa.me/{digitsOnly}?text={encodeURIComponent(message)}
Renders as anchor tag with target="_blank" rel="noopener noreferrer"
Strips all non-digit characters from phone before building URL

--- BottomNav.jsx ---
4 navigation tabs: Dashboard, Members, Leads, Analytics
Uses Next.js usePathname() to determine active tab
Each tab navigates to its route on tap
Active tab is visually distinct from inactive tabs

--- TopBar.jsx ---
Props: { title, showBack }
Displays page title
If showBack=true: shows back button using Next.js useRouter().back()
Settings/menu icon that shows logout option
Logout option calls POST /api/auth/logout then redirects to /login

--- LoadingSpinner.jsx ---
Full-screen centered loading indicator
Used during auth checks and initial data loads

═══════════════════════════════════════════════════════════════════
                        PAGE LOGIC
═══════════════════════════════════════════════════════════════════

--- app/page.js (Root Redirector) ---
On mount: fetch GET /api/auth/check
If adminExists = false → redirect to /setup
If adminExists = true → middleware handles auth check → /dashboard
Show LoadingSpinner while checking

--- app/(auth)/setup/page.js ---
Step 1: Collect gymName in a text input
Step 2: Show PinPad for PIN creation, store entered PIN
Step 3: Show PinPad again for PIN confirmation
If PINs don't match: show error, reset both PIN inputs
On submit: POST /api/auth/setup
On success: redirect to /dashboard

--- app/(auth)/login/page.js ---
On mount: fetch gym name to display (GET /api/auth/check or
          separate endpoint — store gymName in setup response cookie
          or use a public endpoint to get just gymName)
Show PinPad
On 6-digit entry: POST /api/auth/login
On success: redirect to /dashboard
On error: trigger PinDots shake, show "Wrong PIN" message, clear input
After 5 failures: show lockout message with countdown timer

--- app/(dashboard)/layout.js ---
Wraps all dashboard pages with BottomNav at bottom
Provides gymName context by reading from JWT or fetching once

--- app/(dashboard)/dashboard/page.js ---
Fetch GET /api/members (no filter, get all)
Separate fetched members into three arrays using computed status:
  expiredMembers: status === expired (MIA members sorted to top)
  expiringMembers: status === expiring
  activeMembers: status === active

Render SearchBar at top
When search query changes: filter all three arrays client-side
  Search: case-insensitive includes check on name and phone

Render MIAAlert if any expired member has miaFlagged = true

Render three sections in order: expired, expiring, active
Each section shows its MemberCard list
MemberCard onRenew: open RenewalModal for that member
After renewal success: refetch member list

--- app/(dashboard)/members/page.js ---
Fetch GET /api/members with search param from URL
Render SearchBar that updates URL query param ?q=
Render full list of members with MemberCard
Add Member button navigates to /members/new
Tap member card → navigate to /members/[id]

--- app/(dashboard)/members/new/page.js ---
Check URL params for pre-filled data (from lead conversion):
  ?name=&phone=&interest= → pre-fill form fields
Render MemberForm
On submit: POST /api/members
On success: navigate to new member's /members/[id] page

--- app/(dashboard)/members/[id]/page.js ---
Fetch GET /api/members/[id]
Display member profile info
Display PaymentHistory component with payments array
Renew button → opens RenewalModal
WhatsApp reminder button → opens wa.me with pre-filled message
Edit button → navigate to /members/[id]/edit
Delete button → confirm dialog → DELETE /api/members/[id]
  → on success navigate to /members

--- app/(dashboard)/members/[id]/edit/page.js ---
Fetch GET /api/members/[id]
Pre-fill MemberForm with existing data
On submit: PUT /api/members/[id]
On success: navigate back to /members/[id]

--- app/(dashboard)/leads/page.js ---
Fetch GET /api/leads
Separate leads client-side:
  hotLeads: hoursOld >= 48 (render first)
  normalLeads: hoursOld < 48
Render hot leads section first with follow-up call-to-action
Render normal leads below
Add Lead button → opens LeadForm in a bottom sheet or modal
LeadCard onConvert: navigate to /members/new?name=&phone=&interest=
LeadCard onDelete: DELETE /api/leads/[id] → refetch

--- app/(dashboard)/analytics/page.js ---
Fetch GET /api/analytics
Render RevenueBarChart with monthlyRevenue data (dynamic import)
Render RetentionPieChart with active and expired counts (dynamic import)
Render 4 stat cards: total, active, expired, newThisMonth
Render BroadcastVCF component with gymName prop
Show loading skeletons while data is fetching

═══════════════════════════════════════════════════════════════════
                       HOOKS LOGIC
═══════════════════════════════════════════════════════════════════

--- hooks/useMembers.js ---
Uses SWR to fetch /api/members
Config: dedupingInterval: 30000, revalidateOnFocus: false
Exposes: members, isLoading, isError, mutate (for manual refresh)

--- hooks/useLeads.js ---
Uses SWR to fetch /api/leads
Same SWR config as above
Exposes: leads, isLoading, isError, mutate

--- hooks/useAnalytics.js ---
Uses SWR to fetch /api/analytics
Config: dedupingInterval: 300000 (5 min), revalidateOnFocus: false
Exposes: analytics, isLoading, isError

═══════════════════════════════════════════════════════════════════
                   WHATSAPP MESSAGE TEMPLATES
═══════════════════════════════════════════════════════════════════

All messages use member.name, gymName, and relevant dates.
All wa.me links strip non-digit characters from phone number.
All message text is passed through encodeURIComponent in the URL.

EXPIRING reminder (status = expiring):
"Hi {name}! 👋 Your membership at {gymName} expires on {date}.
Renew now to keep your fitness streak going! 💪
Visit us to renew. See you at the gym! 🏋️‍♂️"

EXPIRED reminder (status = expired, not MIA):
"Hi {name}! We miss you at {gymName}! 😊
Your membership expired on {date}.
Come back and crush your goals! Let us know if you'd like to renew. 💪🔥"

MIA reminder (expired 7+ days):
"Hi {name}! It's been {N} days since we've seen you at {gymName}! 🙁
Your membership expired on {date}.
We'd love to have you back! Let's get back on track together. 💪
Reply to know about our current plans!"

LEAD follow-up (lead not converted after 48 hours):
"Hi {name}! 👋 Thanks for visiting {gymName}!
We'd love to help you start your fitness journey.
Are you still interested in joining? We have great plans available.
Reply to this message and we'll get you started! 💪🏋️‍♂️"

═══════════════════════════════════════════════════════════════════
                     ERROR HANDLING RULES
═══════════════════════════════════════════════════════════════════

Every page must handle three states:
1. Loading → show skeleton placeholder elements
2. Error → show error message with retry button that re-triggers fetch
3. Empty → show empty state message with action button

Every form must handle:
1. Validation errors → inline error text below each invalid field
2. API errors → error message shown above submit button
3. Submitting state → disable submit button, show loading indicator

Destructive actions (delete member, delete lead) require:
  Show confirmation UI (bottom sheet or inline confirm)
  with Cancel and Confirm buttons before executing

Never use browser alert(), confirm(), or prompt() anywhere.

═══════════════════════════════════════════════════════════════════
                         PWA CONFIG
═══════════════════════════════════════════════════════════════════

next.config.js: wrap config with withPWA from next-pwa
  disable pwa in development
  dest: public
  runtimeCaching:
    - API routes: NetworkFirst strategy
    - Static assets: CacheFirst strategy

public/manifest.json:
  name: Gym Manager Pro
  short_name: GymMgr
  start_url: /dashboard
  display: standalone
  orientation: portrait
  background_color and theme_color from your chosen palette

root layout.js must include:
  <meta name="theme-color">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black">
  <link rel="manifest" href="/manifest.json">

═══════════════════════════════════════════════════════════════════
                       SECURITY RULES
═══════════════════════════════════════════════════════════════════

1. PIN stored only as bcrypt hash, never plaintext
2. JWT only in HttpOnly cookie, never localStorage or sessionStorage
3. Every non-auth API route must verify JWT from cookie
4. Zod validation on every POST and PUT body before DB operations
5. Strip all non-digit characters from phone numbers before storage
6. Rate limit login to 5 attempts per 15 minutes
7. Never expose JWT_SECRET or MONGODB_URI to client-side code
8. Only NEXT_PUBLIC_ prefixed env vars used in client components
9. Soft delete only for members, never hard delete

═══════════════════════════════════════════════════════════════════
                      BUILD ORDER
═══════════════════════════════════════════════════════════════════

Build in this exact sequence:

PHASE 1 - Foundation
  1. Initialize project, install all dependencies
  2. lib/mongodb.js connection singleton
  3. All 4 Mongoose models
  4. lib/auth.js JWT and bcrypt utilities
  5. lib/dateUtils.js all date helper functions
  6. lib/receiptFormatter.js receipt text generator
  7. middleware.js route protection

PHASE 2 - Auth
  8. All 4 auth API routes
  9. PinDots.jsx component
  10. PinPad.jsx component
  11. /setup page
  12. /login page
  13. root app/page.js redirector
  VERIFY: complete auth flow works before continuing

PHASE 3 - Members
  14. GET and POST /api/members
  15. GET, PUT, DELETE /api/members/[id]
  16. POST /api/members/renew/[id]
  17. MemberCard.jsx
  18. MemberForm.jsx
  19. RenewalModal.jsx with ReceiptGenerator
  20. PaymentHistory.jsx
  21. /members page
  22. /members/new page
  23. /members/[id] page
  24. /members/[id]/edit page
  VERIFY: full member CRUD and renewal works

PHASE 4 - Dashboard
  25. SearchBar.jsx
  26. MIAAlert.jsx
  27. StatusBadge.jsx
  28. /dashboard page with all three sections
  VERIFY: status grouping and MIA flagging is correct

PHASE 5 - WhatsApp
  29. WhatsAppButton.jsx
  30. All reminder message functions
  31. BroadcastVCF.jsx
  32. Integrate into MemberCard and member profile
  VERIFY: all WhatsApp links open with correct pre-filled text

PHASE 6 - Leads
  33. GET, POST /api/leads
  34. PUT, DELETE /api/leads/[id]
  35. LeadCard.jsx with 48hr detection
  36. LeadForm.jsx
  37. /leads page
  VERIFY: 48hr highlight works, conversion to member pre-fills form

PHASE 7 - Analytics
  38. GET /api/analytics with aggregation pipeline
  39. RevenueBarChart.jsx (dynamic import)
  40. RetentionPieChart.jsx (dynamic import)
  41. /analytics page with all components and BroadcastVCF
  VERIFY: charts render with real payment data

PHASE 8 - Layout and PWA
  42. BottomNav.jsx
  43. TopBar.jsx with logout
  44. Dashboard layout wrapper
  45. LoadingSpinner.jsx and all skeleton states
  46. All empty states on every page
  47. All error states on every page
  48. next-pwa configuration
  49. manifest.json
  VERIFY: installable as PWA, offline shell works

PHASE 9 - Final
  50. Add MongoDB indexes in connectDB() on first connection
  51. Verify all API routes return correct response envelope
  52. Verify rate limiting works on login route
  53. Verify soft delete excludes members from all queries
  54. Verify receipt text matches exact format specified above
  55. Verify VCF download generates valid vCard format

Build every file completely. No placeholder comments.
No TODO comments. Every component fully functional.
Write production-ready code for every single file.
Start with Phase 1 Step 1 and work through every step in order.
```