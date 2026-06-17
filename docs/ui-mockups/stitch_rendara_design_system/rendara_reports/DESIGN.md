---
name: Rendara Reports
colors:
  surface: '#FFFFFF'
  surface-dim: '#dcd8e5'
  surface-bright: '#fcf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f2ff'
  surface-container: '#f0ecf9'
  surface-container-high: '#eae6f4'
  surface-container-highest: '#e4e1ee'
  on-surface: '#1b1b24'
  on-surface-variant: '#464555'
  inverse-surface: '#302f39'
  inverse-on-surface: '#f3effc'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4d44e3'
  primary: '#3525cd'
  on-primary: '#ffffff'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#c3c0ff'
  secondary: '#585f6c'
  on-secondary: '#ffffff'
  secondary-container: '#dce2f3'
  on-secondary-container: '#5e6572'
  tertiary: '#7e3000'
  on-tertiary: '#ffffff'
  tertiary-container: '#a44100'
  on-tertiary-container: '#ffd2be'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#dce2f3'
  secondary-fixed-dim: '#c0c7d6'
  on-secondary-fixed: '#151c27'
  on-secondary-fixed-variant: '#404754'
  tertiary-fixed: '#ffdbcc'
  tertiary-fixed-dim: '#ffb695'
  on-tertiary-fixed: '#351000'
  on-tertiary-fixed-variant: '#7b2f00'
  background: '#fcf8ff'
  on-background: '#1b1b24'
  surface-variant: '#e4e1ee'
  recessed-panel: '#F9FAFB'
  workspace-backdrop: '#F3F4F6'
  border-hairline: '#E5E7EB'
  border-input: '#D1D5DB'
  text-primary: '#111827'
  text-placeholder: '#9CA3AF'
  accent-hover: '#4338CA'
  accent-subtle: '#EEF2FF'
  success: '#16A34A'
  warning: '#D97706'
  danger: '#DC2626'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 24px
  section-header:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-md-medium:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  data-mono:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 8px
  panel-padding: 16px
  control-height: 32px
  row-height-sm: 28px
  icon-button: 32px
---

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
