# Experience OS — Operating Area Setup Operator Guide

## Overview & Purpose

This guide explains how a non-technical operator configures an operating region for Experience OS from scratch. Setting up an operating area defines where your company operates and where live events take place.

---

## The 5-Step Setup Hierarchy

Operating areas are structured in a strict 5-level hierarchy:

```
1. Franchise (Organization responsible for a region)
└── 2. Territory (Area managed by a local operating team)
    └── 3. City (City where events will be conducted)
        └── 4. Venue (Physical building or outdoor location where customers arrive)
            └── 5. Playing Area (Exact court, field, room, or hall space)
```

---

## 1. Franchise

- **What it is**: The organization or regional operating head responsible for this region (e.g. *Hyderabad Operations* or *Coastal Sports LLP*).
- **Primary Action**: **Create Franchise** (`/franchises/new`).
- **What to fill**: Franchise Name, Legal Entity, Operating Head Name, Contact Details, Revenue Share %.
- **What happens next**: Once created, the system prompts you to **Add First Territory**.

---

## 2. Territory

- **What it is**: A smaller operating area inside a franchise managed by a local operating team (e.g. *Madhapur Central*).
- **Primary Action**: **Add Territory** (`/territories/new`).
- **What to fill**: Parent Franchise, Territory Name, State/Region, Operating Manager.
- **What happens next**: Once added, the system prompts you to **Add First City**.

---

## 3. City

- **What it is**: The city where events and sessions take place (e.g. *Hyderabad*).
- **Primary Action**: **Add City** (`/cities/new`).
- **What to fill**: Parent Territory, City Name, State.
- **What happens next**: Once added, the system prompts you to **Create First Venue**.

---

## 4. Venue

- **What it is**: The physical location or building where customers arrive (e.g. *Arena Sports Hub*).
- **Primary Action**: **Create Venue** (`/locations/venues/new`).
- **What to fill**: City, Territory, Venue Name, Address, Type (*Arena*, *Club*, *Turf*), Safety Capacity, Emergency Exits.
- **What happens next**: Once created, the system prompts you to **Add First Playing Area**.

---

## 5. Playing Area

- **What it is**: The exact court, field, room, hall, pool, or track inside a venue used for events (e.g. *Badminton Court 1*).
- **Primary Action**: **Add Playing Area** (`/locations/playing-areas/new`).
- **What to fill**: Parent Venue, Space Name, Area Type (*Court*, *Field*, *Room*, *Hall*, *Pool*, *Track*, *Outdoor Zone*), Max Player Capacity, Compatible Activities.
- **What happens next**: Your operating structure setup is **100% Complete**! You can now define **Experience Templates** and **Schedule Live Events**.

---

## Setup Health & Readiness Badges

- **Complete**: All 5 levels exist; ready to schedule events.
- **Needs Attention**: Venues exist but have no playing area added.
- **Incomplete**: One or more required levels (Franchise, Territory, City, Venue, or Playing Area) are missing.

---

## Summary of Example Hierarchy

```
Hyderabad Operations (Franchise)
└── Madhapur Central (Territory)
    └── Hyderabad (City)
        └── Arena Sports Hub (Venue)
            └── Badminton Court 1 (Playing Area)
```
