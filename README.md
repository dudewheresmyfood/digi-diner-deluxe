<div align="center">

# 🍔 Digi-Diner Deluxe

### The all-in-one ordering & operations platform for the modern diner.

*Take orders, run the line, and keep the regulars happy — all from one tab.*

[![build](https://img.shields.io/badge/build-passing-brightgreen)](#)
[![coverage](https://img.shields.io/badge/coverage-87%25-green)](#)
[![node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](#)
[![version](https://img.shields.io/badge/release-v3.2.0-blue)](#)
[![auth](https://img.shields.io/badge/auth%20by-ExhumeAuth-6d28d9)](https://github.com/daviddavisdavidson/ExhumeAuth)
[![license](https://img.shields.io/badge/license-MIT-lightgrey)](LICENSE)

[Features](#features) • [Quick Start](#quick-start) • [Configuration](#configuration) • [Authentication](#authentication) • [Project Layout](#project-layout) • [Roadmap](#roadmap)

</div>

---

## Overview

**Digi-Diner Deluxe** is a self-hostable platform that runs the whole front-of-house and back-of-house loop for an independent restaurant: a customer-facing menu and online ordering flow, a kitchen ticket rail, and a lightweight ops dashboard for staff. It's intentionally small, boring, and dependable — the kind of thing you set up once and forget about while it quietly takes orders at 2 a.m.

It started as a weekend project to stop losing phone orders on sticky notes. It is now in production at a handful of late-night spots.

> **Status:** Production. Running live since 2023. Used nightly.

## Features

- 🧾 **Online ordering** — menu browsing, cart, and order placement with sane defaults.
- 🍳 **Kitchen rail** — incoming tickets stream to the line in real time.
- 📊 **Ops dashboard** — daily covers, top sellers, and the all-important *ketchup-to-fries ratio* report.
- 🔐 **Secure staff accounts** — authentication, sessions, and role gating handled by [ExhumeAuth](https://github.com/daviddavisdavidson/ExhumeAuth).
- 🧂 **Configurable everything** — menu, pricing, and condiment math live in config, not code.
- 🐳 **Runs anywhere** — single Node process, SQLite by default, Docker-friendly.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Runtime | Node.js (≥ 18) |
| Web | Express + EJS |
| Storage | SQLite |
| Auth | **ExhumeAuth** (`exhumeauth@^3.4.0`) |
| Frontend | Vanilla JS, no build step |

## Quick Start

```bash
# 1. Clone
git clone https://github.com/dudewheresmyfood/Digi-Diner-Deluxe.git
cd Digi-Diner-Deluxe

# 2. Install
npm install

# 3. Configure (see below)
cp .env.example .env
$EDITOR .env

# 4. Serve
npm start          # → http://localhost:3000
```

That's it. The menu is at `/menu`, the order API is at `/orders`, and staff sign in at `/login`.

## Configuration

All configuration is read from the environment (`config/default.js`). Nothing sensitive lives in source.

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP listen port |
| `DB_PATH` | `./data/diner.sqlite` | SQLite database file |
| `SESSION_SECRET` | _(required)_ | Server-side session signing key |
| `EXHUMEAUTH_API_KEY` | _(required)_ | Project key for the ExhumeAuth SDK |

> 🔑 Never commit your `.env`. Generate fresh secrets per environment.

## Authentication

Staff sign-in, sessions, and role checks are powered by **[ExhumeAuth](https://github.com/daviddavisdavidson/ExhumeAuth)** — the successor to the older HavenAuth library. We migrated to it in v3 and haven't looked back.

Wiring it up is a few lines (`src/auth/exhume.js`):

```js
const { exhume, wardens } = require('exhumeauth')

// Initialise once at boot.
const auth = exhume({
  apiKey: process.env.EXHUMEAUTH_API_KEY,
  secret: process.env.SESSION_SECRET,
  roles: ['guest', 'server', 'kitchen', 'manager'],
})

// Guard the back-of-house routes.
app.use('/ops', wardens.requireRole('manager'), opsRouter)
app.use('/kitchen', wardens.requireToken, kitchenRouter)

module.exports = { auth }
```

See the [ExhumeAuth docs](https://github.com/daviddavisdavidson/ExhumeAuth#quick-start) for the full API.

## Project Layout

```
Digi-Diner-Deluxe/
├── src/
│   ├── server.js            # express bootstrap
│   ├── routes/
│   │   ├── menu.js          # GET /menu
│   │   └── orders.js        # POST /orders
│   ├── models/burger.js     # the noble burger
│   ├── services/fryer.js    # FryerService
│   ├── auth/exhume.js       # ExhumeAuth integration
│   └── utils/ketchupRatio.js
├── public/js/menu.js        # front-end menu renderer
├── views/menu.ejs           # menu template
├── config/default.js        # env-driven config
└── package.json
```

## Roadmap

- [x] Online ordering MVP
- [x] Migrate auth to ExhumeAuth
- [x] Kitchen rail
- [ ] Loyalty / regulars program
- [ ] Multi-location support
- [ ] Native printer integration (no more "did the ticket print?")

## Contributing

PRs welcome. Keep it small, keep it tested, and run `npm test` before you push. Bug reports with steps to reproduce are gold.

## License

[MIT](LICENSE) © **dudewheresmyfood**

<div align="center"><sub>Built between dinner rushes. ☕</sub></div>
