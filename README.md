# Mow Time

Mow Time is a toy project for experimenting with lawn-coverage planning. The goal is to let a user sketch their yard, plug in mower preferences, and preview an efficient mowing pattern.

<img width="1188" height="855" alt="Screenshot 2025-11-06 100651" src="https://github.com/user-attachments/assets/07702392-6eea-4375-85d0-21ce9e5f9f8c" />

### Features To-Do

- Radically improve the mowing algorithm
- Allow user to select mower model and hydrate mow-time form with mower cutting width and speed
- Add more complex mowing area manipulation
- User can store previously constructed maps
- User can print the mowing path map
- User stored preferences

## Product Overview

- Capture mower configuration
- Use an interactive satellite map to outline one or more yard polygons, including "obstacles" to represent unmowable areas.
- Send the shapes to a backend service that returns a proposed mowing path.
- Display the generated path to the user.

## UI Walkthrough

- **Mower Setup** – A form panel where the user enters their mower deck width. It also shows the number of drawn areas, route statistics, and primary actions (`Mow Time!`, `Edit Area`).
- **Map Canvas** – Powered by the Google Maps JavaScript API. The user can search for an address (Google Places autocomplete), jump to the location, and draw polygons using the embedded drawing tools. The mow path overlay toggles between editable mode and view-only mode.
- **Modal Search Results** – When a search is performed, the top predictions are shown so the user can choose the exact address before the map recenters.

## Algorithm Status

The backend `POST /api/mow-time` endpoint currently returns a placeholder striping algorithm. It lines the polygon with evenly spaced stripes based on deck width. A real implementation would account for mower turning radius, obstacle avoidance, and optimal traversal order.
