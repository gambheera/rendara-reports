# Rendara Reports Design System

## Design Principles
- **Quiet & Precise**: Minimal visual noise to ensure the user's data and reports remain the hero.
- **Document-First**: The UI feels like a professional workspace for high-stakes reporting.
- **Grayscale Chrome**: Neutral interface elements with Indigo as a singular, intentional accent color.
- **High Information Density**: Precise 32px control heights and 13px/14px typography for desktop productivity.

## Color Palette (Light Theme)
- **Surface**: `#FFFFFF` (Primary background, cards, modals)
- **Recessed Panels**: `#F9FAFB` (Sidebar, secondary headers)
- **Workspace Backdrop**: `#F3F4F6` (Main application background behind the "paper")
- **Report "Paper"**: `#FFFFFF` (The report canvas, with soft shadow)
- **Borders (Hairline)**: `#E5E7EB` (Default separators)
- **Borders (Input)**: `#D1D5DB` (Form controls, active regions)
- **Text Primary**: `#111827` (Headings, primary content)
- **Text Secondary**: `#6B7280` (Labels, metadata, icons)
- **Text Placeholder**: `#9CA3AF` (Input hints)
- **Accent (Indigo)**: `#4F46E5` (Primary actions, selection states)
- **Accent Hover**: `#4338CA`
- **Accent Subtle**: `#EEF2FF` (Selection backgrounds, badge backgrounds)
- **Success**: `#16A34A`
- **Warning**: `#D97706`
- **Danger**: `#DC2626`

## Typography
- **UI Font**: Inter (Inter UI)
- **Mono Font**: JetBrains Mono (For JSON, expressions, data values)
- **Scale**:
  - **Titles**: 20px / Weight 600 / Leading Tight
  - **Section Headers**: 14px / Weight 600
  - **Body & Inputs**: 14px / Weight 400-500
  - **Dense Labels**: 13px / Weight 500
  - **Captions**: 12px / Weight 500
- **Numerals**: Tabular numerals for all data-driven components.

## Geometry & Spacing
- **Grid**: 8px base grid.
- **Padding**: 16px standard panel padding.
- **Radius**:
  - `6px`: Buttons, Inputs, Selects.
  - `8px`: Cards, Panels, Dialogs, Menus.
- **Heights**:
  - `32px`: Standard control height (Buttons, Inputs, Toggles).
  - `28px`: Tree view and list rows.
  - `32x32px`: Icon buttons.

## Iconography
- **Style**: Line/Outline icons, Lucide-inspired.
- **Stroke**: 1.5px.
- **Sizing**: 16px inline, 20px toolbar.
- **Color**: `#6B7280` (Default), `#4F46E5` (Active/Accent).

## Core Components
- **Buttons**:
  - Primary: Indigo background, white text.
  - Secondary: Outline (`#D1D5DB`), text `#111827`.
  - Ghost: No background, text `#6B7280`.
- **Inputs**: 32px height, `#D1D5DB` border, 6px radius. Indigo `#4F46E5` 3px focus ring.
- **Segmented Controls**: Recessed `#F9FAFB` track, white sliding pill for active state.
- **Tabs**: Horizontal navigation with a 2px Indigo underline for active states.
- **Collapsible Panels**: Secondary headers (13px/600, uppercase, `#6B7280`).
- **Tree View**: 28px row height, subtle `#EEF2FF` hover state.
- **Dialogs**: 8px radius, 24px padding, right-aligned footer actions.

## Motion
- **Duration**: 120–160ms.
- **Easing**: Ease-out.
- **Usage**: Subtle transitions for hover, focus, and panel expansion.
