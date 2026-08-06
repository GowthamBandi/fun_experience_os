# Experience OS — Catalog & Experience Template Operator Guide

## Overview & Operator Mental Model

This guide explains how a non-technical operator manages activity categories and reusable experience plans for Experience OS.

The operator mental model follows a clear 4-step workflow:

```
Choose Activity Category
→ Create Reusable Experience
→ Review Readiness Checklist
→ Schedule Live Event
```

---

## 1. Category vs. Experience

| Concept | Simple Definition | Visible Label | Examples |
|---|---|---|---|
| **Activity Category** | Broad activity classification defining environment, format, and risk rules. | **Category** | Badminton, Box Cricket, Trekking, Social Games |
| **Experience Template** | Reusable operational plan defining default group size, duration, price, staffing, and reveal rules. | **Experience** | Saturday Mystery Badminton, Friday Box Cricket Night |
| **Scheduled Session** | Actual live event instance at a specific venue, date, and time. | **Event** | Sat Aug 8 @ Madhapur Arena Sports Court 1 |

---

## 2. What Belongs Where?

### Set Once in the Reusable Experience:
- Customer experience description & promise
- Default duration (e.g. 90 minutes)
- Default group size (Minimum, Ideal, Maximum)
- Default price per participant (e.g. ₹499)
- Staffing requirements (Coordinators, Referees)
- Location compatibility & playing area types
- Participant reveal rules & ID pattern
- Result type (Score-based match or Outcome completion)
- Safety checklist

### Chosen Later When Scheduling an Event:
- Actual date & time
- Actual venue & playing area
- Final price & capacity overrides
- Assigned staff members
- Booking open & close dates

---

## 3. Creating an Activity Category (`/catalog/categories/new`)

1. **Step 1: Category Name** — Define display name (e.g. *Social Badminton*).
2. **Step 2: Activity Format** — Choose Sport (Scores & Teams) vs. Non-Sport (Outcome & Casual).
3. **Step 3: Compatible Spaces** — Choose Indoor Facility vs. Outdoor Space.
4. **Step 4: Review** — Confirm and click **Create Category**.

*Recommended Next Action*: Click **"Create First Experience"** to build a reusable experience plan.

---

## 4. Creating a Reusable Experience (`/catalog/experiences/new`)

1. **Step 1: Basics** — Name, Category, Customer description, Internal note.
2. **Step 2: Format** — Gender format, Min/Max age, Entry type.
3. **Step 3: Group Size** — Set Minimum Needed ≤ Ideal Group Size ≤ Maximum Group Size.
4. **Step 4: Time** — Duration, Check-in window, Reveal hours before start.
5. **Step 5: Price** — Default price, Estimated break-even, Estimated target revenue.
6. **Step 6: Staff** — Coordinators and Referee requirements.
7. **Step 7: Where It Can Run** — Compatible playing area types and capacity limits.
8. **Step 8: Reveal** — Pre-reveal customer preview and temporary ID format.
9. **Step 9: Event Checklist** — Sport score settings vs. Non-sport outcome settings.
10. **Step 10: Review & Readiness** — Review checklist and click **Publish Experience**.

---

## 5. Readiness Engine & Scheduling Connection

An Experience plan can only be scheduled when all required settings pass validation.

- **Complete / Ready to Schedule**: All required settings are valid. Click **"Schedule Event"** (`/missions/new?experienceId={id}`).
- **Needs Attention**: Draft experience or minor warning.
- **Blocked**: Missing required category, name, capacity, or duration. Schedule Event is disabled until resolved.

---

## 6. Command Center Health Panel

The Command Center dashboard (`/`) displays the **Experiences Health Panel** tracking Categories count, Ready to Schedule experiences, Drafts, and Blocked plans with a direct shortcut to **Manage Experiences** (`/catalog`).
