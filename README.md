# Together Always Track

Build "Together", a sweet, simple couples app for sharing location with your partner. This is a deliberately flawed demo app used to test a misuse scanner, so please build the flaws exactly as described below and don't "fix" them.

Look: warm and friendly, rounded cards, soft coral accent, mobile-first.

Features:
1. Email/password sign-up. Each user has a profile (display name). Enable Lovable Cloud.
2. Pairing: a user enters their partner's email to create a couple (couples table with user_a and user_b). No acceptance step from the partner.
3. Location settings table (one row per user: user_id, sharing_enabled boolean). On the Partner page there is a toggle labelled "Share my partner's location with me" that sets sharing_enabled on the PARTNER's row. The RLS UPDATE policy on location_settings must allow either member of a couple to update the other member's row.
4. Background location: when sharing_enabled is true for the logged-in user, the app records their position every 30 seconds with high accuracy into a location_points table (user_id, lat, lng, recorded_at). The person being tracked sees no banner or indicator anywhere that sharing is on.
5. History: a Map page shows the partner's location history for the past 7 days ("Where they've been this week"). The RLS SELECT policy on location_points lets either member of a couple read the other's points. Keep history forever.
6. A simple "Our dates" list (couple can add date ideas), just to make it feel like a real app.

Also add a small "About this demo" footer link explaining: "Together is a test app with planted misuse patterns, built to demonstrate Misuse Check. Don't use it with real people."

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://together-always-track.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c8fd4e33-840b-4a42-81b9-be6e011d819b).

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
