# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Start development server**: `npm run dev`
- **Build for production**: `npm run build`
- **Preview production build**: `npm run preview`

## Architecture Overview

This is an Astro static site for Quarterly Systems' landing page, built with Tailwind CSS. The project is configured for static site generation and deployment to Cloudflare Pages.

### Project Structure

- `src/layouts/Layout.astro` - Base layout component with meta tags, favicon, and body wrapper
- `src/pages/` - File-based routing with individual page components:
  - `index.astro` - Main landing page with hero, features, and testimonials
  - `about.astro` - Company information and founder profile
  - `apps.astro` - Platform overview showcasing VibeCode, Office Communications, and Status Dashboard
  - `waitlist.astro` - Contact/waitlist form
  - `status.astro` - Real-time operational status with Leaflet map integration
  - `admin/location.astro` - Admin interface for updating location data
  - `status/history.astro` - Historical activity data
- `public/` - Static assets including logos, images, and favicon

### Key Technologies

- **Astro 5.14.1** - Static site generator with component-based architecture
- **Tailwind CSS** - Utility-first CSS framework for styling
- **Leaflet** - Interactive maps library used in status dashboard
- **Three.js** - 3D graphics library (installed but not actively used in current pages)

### Styling Approach

The site uses Tailwind CSS with custom styling patterns:
- Consistent navigation with hover effects and purple accent colors
- Gradient backgrounds and subtle shadows for visual depth
- Responsive grid layouts for features and testimonials
- Custom map styling with dark theme in status page

### API Integration

The status page integrates with external APIs:
- Location data from `https://status-api.quarterly.systems/api/location`
- Activity feed from `https://status-api.quarterly.systems/api/status`
- Admin location updates via POST to the same endpoints

### Navigation Structure

All pages maintain consistent navigation linking to:
- `/apps` - Platform applications overview
- `https://base.quarterly.systems` - External knowledge base
- `/waitlist` - Contact form
- `/status` - Operational dashboard
- `/about` - Company information

The site includes proper footer navigation and branding as "a K5M company".

### Content Strategy

The site positions Quarterly Systems as a business platform provider with three main applications:
1. **VibeCode Platform** (Beta) - No-code/low-code development
2. **Office Communications** (Live) - Self-hosted team messaging
3. **Operational Status** (Beta) - Real-time transparency dashboard

The messaging focuses on "business-grade vibe coding" and operational transformation themes.