# Job Scout - Design Standards & UX Principles

**Always reference this file when building any Job Scout feature.**

---

## CORE PRINCIPLE: The App Teaches Itself

Users should understand how to use Job Scout without training. Every page, button, and feature should be self-explanatory.

---

## SALES FLOW (Numbered in Menu)

The menu shows the business flow with numbered steps:

1. **Leads** - All potential customers start here
2. **Lead Setter** - Call leads & schedule appointments
3. **Pipeline** - Track leads through sales process
4. **Quotes** - Create & send price quotes
5. **Jobs** - Won quotes become jobs

Each menu item has a tooltip explaining its purpose on hover.

---

## LEAD JOURNEY (Status Flow)

Leads move through these statuses:

```
New → Contacted → Callback → Appointment Set → Qualified → Quote Sent → Negotiation → Won/Lost
```

### Status Definitions:
- **New** - Fresh lead, never contacted
- **Contacted** - Spoke with customer
- **Callback** - Customer requested callback at specific time
- **Appointment Set** - Meeting scheduled (enters Pipeline)
- **Qualified** - Salesperson confirmed good fit
- **Quote Sent** - Price quote delivered to customer
- **Negotiation** - Discussing terms/price
- **Won** - Customer accepted, becomes Job
- **Lost** - Customer declined (track reason)

---

## COLOR PALETTE

### Theme Colors (Light Mode)
```javascript
const theme = {
  bg: '#f7f5ef',           // Page background (warm off-white)
  bgCard: '#ffffff',       // Card background
  border: '#d6cdb8',       // Borders (warm tan)
  text: '#2c3530',         // Primary text (dark green-gray)
  textSecondary: '#4d5a52', // Secondary text
  textMuted: '#7d8a7f',    // Muted/helper text
  accent: '#5a6349',       // Primary accent (olive green)
  accentBg: 'rgba(90,99,73,0.12)' // Accent background
}
```

### Status Colors
```javascript
const statusColors = {
  'New': '#3b82f6',           // Blue
  'Contacted': '#8b5cf6',     // Purple
  'Callback': '#f59e0b',      // Amber/Orange
  'Appointment Set': '#22c55e', // Green
  'Qualified': '#3b82f6',     // Blue
  'Quote Sent': '#8b5cf6',    // Purple
  'Negotiation': '#f59e0b',   // Amber
  'Won': '#10b981',           // Emerald green
  'Lost': '#64748b'           // Slate gray
}
```

### Semantic Colors
- **Success/Positive**: `#22c55e` (green), bg: `#dcfce7`
- **Warning**: `#f59e0b` (amber), bg: `#fef3c7`
- **Error/Danger**: `#dc2626` (red), bg: `#fee2e2`
- **Info**: `#3b82f6` (blue), bg: `#dbeafe`

---

## TYPOGRAPHY

- **Page titles**: 22px, font-weight: 700
- **Section headers**: 16-18px, font-weight: 600
- **Card titles**: 14-16px, font-weight: 600
- **Body text**: 14px, font-weight: 400
- **Helper/muted text**: 12-13px, color: textMuted
- **Labels**: 13px, font-weight: 500
- **Tiny text (badges, counts)**: 11-12px

---

## COMPONENT STANDARDS

### Buttons

**Primary Button**
```javascript
{
  padding: '10px 16px',
  backgroundColor: theme.accent,
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  fontWeight: '500',
  cursor: 'pointer'
}
```

**Secondary Button**
```javascript
{
  padding: '10px 16px',
  backgroundColor: 'transparent',
  color: theme.accent,
  border: `1px solid ${theme.accent}`,
  borderRadius: '8px',
  fontWeight: '500',
  cursor: 'pointer'
}
```

**Ghost Button**
```javascript
{
  padding: '10px 16px',
  backgroundColor: 'transparent',
  color: theme.textSecondary,
  border: `1px solid ${theme.border}`,
  borderRadius: '8px',
  cursor: 'pointer'
}
```

### Cards
```javascript
{
  backgroundColor: theme.bgCard,
  borderRadius: '12px',
  border: `1px solid ${theme.border}`,
  padding: '16px'  // or '20px' for larger cards
}
```

### Inputs
```javascript
{
  width: '100%',
  padding: '10px 12px',
  border: `1px solid ${theme.border}`,
  borderRadius: '8px',
  fontSize: '14px',
  color: theme.text,
  backgroundColor: theme.bgCard
}
```

### Modals
```javascript
// Overlay
{
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 50
}

// Modal Content
{
  backgroundColor: theme.bgCard,
  borderRadius: '16px',
  width: '100%',
  maxWidth: '480px',
  maxHeight: '90vh',
  overflowY: 'auto'
}
```

---

## NO EMOJIS RULE

**DO NOT use emojis in the UI.** Use Lucide React icons instead.

```javascript
// WRONG
<span>📅 Appointment</span>

// CORRECT
import { Calendar } from 'lucide-react'
<Calendar size={16} /> Appointment
```

Common icons to use:
- `Calendar` - appointments, dates
- `Phone` - calls, phone numbers
- `Mail` - email
- `User` - people, contacts
- `Building2` - businesses
- `MapPin` - addresses
- `DollarSign` - money, prices
- `Plus` - add new
- `X` - close, cancel
- `ChevronLeft/Right` - navigation
- `Trophy` - won/success
- `XCircle` - lost/error
- `RefreshCw` - refresh
- `Settings` - settings

---

## SELF-EXPLANATORY UI PATTERNS

### 1. Section Headers with Context
Every section should have a title AND a brief description:

```javascript
<div>
  <h2>Lead Setter</h2>
  <p style={{ color: theme.textMuted }}>
    Call leads and drag them to the calendar to schedule appointments
  </p>
</div>
```

### 2. Empty States with Guidance
When there's no data, explain what should go there:

```javascript
<EmptyState
  icon={Calendar}
  title="No appointments scheduled"
  message="Drag a lead from the left panel to a time slot to schedule their appointment."
  actionLabel="Go to Leads"
  onAction={() => navigate('/leads')}
/>
```

### 3. Tooltips for Non-Obvious Actions
Use `<Tooltip>` component for buttons that aren't self-explanatory:

```javascript
<Tooltip text="Mark this quote as sent to the customer">
  <button onClick={handleSendQuote}>
    <Send size={16} /> Mark Sent
  </button>
</Tooltip>
```

### 4. Status Badges with Color
Always show status with appropriate color:

```javascript
<span style={{
  padding: '4px 10px',
  backgroundColor: statusColors[status] + '20',
  color: statusColors[status],
  borderRadius: '6px',
  fontSize: '12px',
  fontWeight: '600'
}}>
  {status}
</span>
```

### 5. Clickable Items Show Cursor
Any clickable element must have `cursor: 'pointer'`

### 6. Today Highlighting
When showing dates, highlight "today" items:

```javascript
const isToday = new Date(dateStr).toDateString() === new Date().toDateString()

<div style={{
  backgroundColor: isToday ? '#dcfce7' : '#f0fdf4',
  color: isToday ? '#166534' : '#15803d',
  fontWeight: isToday ? '600' : '400'
}}>
  {isToday ? 'TODAY' : formattedDate}
</div>
```

---

## CALENDAR STANDARDS

### Navigation
- `««` - Previous month
- `‹` - Previous week
- **Today** (green button) - Jump to current week
- `›` - Next week
- `»»` - Next month

### Time Slots
- Show hours 7:00 AM to 7:00 PM (7-19)
- Each slot is 50px tall
- Highlight today's column with subtle background
- Show drop zone when dragging

### Appointment Display
```javascript
{
  backgroundColor: isToday ? '#d1fae5' : theme.accentBg,
  borderLeft: `3px solid ${isToday ? '#059669' : theme.accent}`,
  borderRadius: '4px',
  padding: '4px 6px',
  fontSize: '10px',
  cursor: 'pointer'
}
```

---

## PIPELINE STANDARDS

### Kanban Board
- Horizontal scrolling columns
- Each column has colored top border matching status
- Cards are draggable
- Drop zone highlights on drag over

### Lead Cards Show:
1. Customer name (bold)
2. Business name (if exists)
3. Value (green, if exists)
4. Appointment date/time (if exists, highlight if today)
5. Service type (small, muted)
6. Owner avatar (bottom)

### Won/Lost Handling
- Drag to Won → Show celebration modal, capture notes
- Drag to Lost → Show modal, require reason selection

---

## DATA DISPLAY PATTERNS

### Currency
```javascript
const formatCurrency = (value) => {
  if (!value) return '$0'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}
```

### Dates
```javascript
// Short date
date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
// "Jan 26"

// Full date
date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
// "Sunday, January 26"

// Time
date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
// "3:00 PM"
```

### Phone Numbers
Display as-is. Make them clickable: `<a href="tel:${phone}">`

### Email
Display truncated if long. Make clickable: `<a href="mailto:${email}">`

---

## MOBILE CONSIDERATIONS

- Check `window.innerWidth < 768` for mobile
- On mobile, use list view instead of kanban
- Stack columns vertically
- Make touch targets at least 44px
- Collapse sidebars to hamburger menu

---

## LOADING STATES

Show a centered loading message:
```javascript
if (loading) {
  return (
    <div style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}>
      Loading...
    </div>
  )
}
```

---

## ERROR HANDLING

Show errors in red boxes:
```javascript
{error && (
  <div style={{
    padding: '12px',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    color: '#dc2626',
    fontSize: '14px',
    marginBottom: '16px'
  }}>
    {error}
  </div>
)}
```

---

## FORM PATTERNS

### Labels
```javascript
<label style={{
  display: 'block',
  fontSize: '13px',
  fontWeight: '500',
  color: theme.textSecondary,
  marginBottom: '6px'
}}>
  Field Name *
</label>
```

### Required Fields
Mark with `*` after label text

### Form Buttons
Always have Cancel and Submit side by side:
```javascript
<div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
  <button type="button" onClick={onCancel} style={secondaryButtonStyle}>
    Cancel
  </button>
  <button type="submit" style={primaryButtonStyle}>
    Save
  </button>
</div>
```

---

## CONFIRMATION PATTERNS

### Dangerous Actions
Always confirm before delete:
```javascript
if (!confirm('Delete this item? This cannot be undone.')) return
```

### Success Feedback
After successful action, either:
1. Close modal and refresh data (preferred)
2. Show brief toast/alert

---

## FILE ORGANIZATION

```
src/
├── components/
│   ├── Layout.jsx        # Main layout with sidebar
│   ├── Tooltip.jsx       # Reusable tooltip
│   ├── HelpBadge.jsx     # ? icon with tooltip
│   ├── EmptyState.jsx    # Empty state component
│   └── AppointmentsCalendar.jsx  # Shared calendar
├── pages/
│   ├── Leads.jsx         # Lead list/cards
│   ├── LeadDetail.jsx    # Single lead view
│   ├── LeadSetter.jsx    # Kanban + calendar for setters
│   ├── SalesPipeline.jsx # Pipeline kanban board
│   ├── Quotes.jsx        # Quote list
│   └── Jobs.jsx          # Jobs list
└── lib/
    ├── supabase.js       # Supabase client
    ├── store.js          # Zustand store
    └── schema.js         # Constants and enums
```

---

## REMEMBER

1. **No emojis** - Use Lucide icons
2. **Self-explanatory** - Every feature teaches itself
3. **Consistent colors** - Use the theme
4. **Status = Color** - Always show status with its color
5. **Today = Green highlight** - Make today's items stand out
6. **Drag = Visual feedback** - Show drop zones
7. **Click = Pointer cursor** - Make clickable things obvious
8. **Empty = Guidance** - Tell users what to do when there's no data
