# Family Hub

A self-hosted family intranet: a dashboard for the house plus a simple way for everyone to request films, TV shows and music. It runs as a single Docker container on Unraid (or any Docker host) and talks to your existing services:

| Service | Default address | Used for |
|---|---|---|
| Sonarr | `http://192.168.1.200:8989` | TV requests, upcoming episodes, queue, recent imports |
| Radarr | `http://192.168.1.200:7878` | Film requests, upcoming releases, queue, recent imports |
| Lidarr | `http://192.168.1.200:8686` | Music (artist) requests, queue, recent imports |
| Plex | `http://192.168.1.202:32400` | Online/offline status and quick link |
| Home Assistant | `http://homeassistant.local:8123` (placeholder: change it) | Lights, switches, temperatures, sensors and presence |

> **Note on the Plex address:** the original notes listed Plex at `192.169.1.202`. That looks like a typo, because every other server is on `192.168.1.x`, so the default here is **`192.168.1.202`**. If Plex really is somewhere else, set `PLEX_URL`.

The plan is to run Family Hub on the **currently unused Unraid server at `192.168.1.201`**. Once it's running, the family opens **`http://192.168.1.201:3000`**. It will run on any other server too (see [Running it somewhere else](#running-it-somewhere-else)).

---

## Features

- **Profiles and PINs.** Everyone picks their name and types a personal 4–8 digit PIN. PINs are stored as salted scrypt hashes. Five wrong PINs lock that profile for 15 minutes.
- **Admin role.** The first account (Andrew) is created from environment variables. Admins can add, edit and remove family members, reset PINs, approve or decline requests and change settings.
- **Dashboard:**
  - Status tiles (online/offline and version) for Sonarr, Radarr, Lidarr, Plex and Home Assistant
  - Downloads in progress, with a progress bar and time left
  - Recently added items, taken from the import history of each *arr app
  - Upcoming TV episodes (next 14 days, from Sonarr) and film releases (next 60 days, from Radarr)
  - A Home Assistant panel. Lights, switches, fans and input booleans get toggles. Other entities show as readings.
  - Quick links to every service
- **Requests.** Search films (Radarr), TV (Sonarr) and music artists (Lidarr), with artwork, year and overview. Results already in the library show **"Already in library"**. Results someone has already asked for show **"Already requested by …"**.
- **Approval mode** (a toggle under Admin › Settings):
  - **Off:** requests go straight to the right *arr app, using the default root folder and quality profile.
  - **On:** requests wait for an admin to approve them. Admins' own requests always go straight through.
- **My requests and All requests** pages show each request's status: *pending, approved, downloading, available, declined* (and *failed*, with the error and a Retry button). The status is updated live from the *arr libraries and queues.
- **Everything runs server-side.** Sonarr, Radarr, Lidarr, Plex and Home Assistant are only ever called from the container. API keys and tokens never reach the browser.
- **Recommendations.** "TV shows you may enjoy" and "Films you may enjoy" rows on the dashboard, plus a fuller **Discover** page. They're based on what's already in Sonarr and Radarr ("Because you have Shetland") plus what's trending this week. Each card has a poster, year, short overview and a **Request** button that uses the normal request flow, so the approval toggle and duplicate checks still apply. Anything already in the library or already requested is left out.
- **Phone-friendly, installable app.** A bottom tab bar on phones (with a **More** sheet for admin pages, account and sign-out), large tap targets, iPhone notch support, and no zooming into text boxes. Add it to your home screen and it opens full-screen like an app (see *Add to your phone's home screen* below).
- **Looks and works on any screen:** responsive for phones, tablets, desktops and TVs. Dark theme by default with a light option. Accent colour `#1B4F8A`.
- **Demo mode** (`DEMO_MODE=true`) shows realistic mock data, so you can try the UI before connecting anything.

---

## 1. Get your API keys and tokens

### Sonarr, Radarr and Lidarr
In each app go to **Settings › General**. Under **Security** (on older versions, **Security / API**) copy the **API Key**. If it's hidden, tick *Show Advanced* at the top.

- Sonarr: `http://192.168.1.200:8989/settings/general` → `SONARR_API_KEY`
- Radarr: `http://192.168.1.200:7878/settings/general` → `RADARR_API_KEY`
- Lidarr: `http://192.168.1.200:8686/settings/general` → `LIDARR_API_KEY`

### Home Assistant long-lived access token
1. In Home Assistant, click your **profile** (your name, bottom-left of the sidebar).
2. Open the **Security** tab.
3. Scroll to **Long-lived access tokens** and click **Create token**.
4. Name it `Family Hub` and copy the token straight away (it is only shown once). This is `HA_TOKEN`.
5. Set `HA_URL` to your Home Assistant address, e.g. `http://192.168.1.50:8123`.

> The token has the same rights as the user who created it. To limit what Family Hub can do, create a separate non-admin Home Assistant user for it. Family Hub will only toggle entities that are on its dashboard list, and only lights, switches, fans and input booleans.

To find entity IDs, go to **Settings › Devices & services › Entities** in Home Assistant. Examples: `light.living_room`, `sensor.outdoor_temperature`, `person.andrew`.

### Plex (optional)
Family Hub checks `PLEX_URL/identity`, which normally works without a token. If your server needs one, see Plex's guide *"Finding an authentication token / X-Plex-Token"* and set `PLEX_TOKEN`.

### TMDB (optional, for better recommendations)
Recommendations work without this, but a free TMDB key gives the personalised "Because you have …" rows for both TV and films.

1. Create a free account at [themoviedb.org](https://www.themoviedb.org/signup) and confirm your email.
2. Click your avatar › **Settings** › **API** (or go to `https://www.themoviedb.org/settings/api`).
3. Click **Create** / **Request an API key**, choose **Developer**, accept the terms and fill in the short form. For personal use, "Family Hub – home media requests" is fine as the description, and you can use any URL (e.g. `http://192.168.1.201:3000`).
4. Copy the **API Key** (the short one). The long **API Read Access Token** also works.
5. Put it in `.env` as `TMDB_API_KEY=...`, then rebuild and restart (see *Updating*).

Admin › Settings shows whether the key is set. The key is only used by the server, and results are cached for 6 hours (`REC_CACHE_HOURS`).

**Without a key:** TV recommendations come from TVmaze (no key needed) and film recommendations come from Radarr's own discover lists. If neither is available, admins see a hint on the Discover page and the dashboard carries on as normal.

Requests from recommendations go through Sonarr/Radarr lookups (TVDB ID for Sonarr, TMDB ID for Radarr), exactly like a normal search.

---

## 2. Install on Unraid (server 192.168.1.201)

Pick **one** of the two methods below. Both keep the database in `/mnt/user/appdata/family-hub`, so it's covered by your appdata backups.

### Copy the project to the server first
From your PC, copy this whole folder to the Unraid server, for example to `/mnt/user/appdata/family-hub-src`. You can use the `appdata` SMB share, or:

```bash
scp -r family_hub root@192.168.1.201:/mnt/user/appdata/family-hub-src
```

### Method A: Docker Compose Manager plugin (recommended)

1. In Unraid open **Apps** and install **Docker Compose Manager** (by *dcflacon*).
2. Open an Unraid terminal (the `>_` icon, top right) and create your settings file:
   ```bash
   cd /mnt/user/appdata/family-hub-src
   cp .env.example .env
   nano .env        # fill in ADMIN_PIN, the API keys, HA_URL and HA_TOKEN
   ```
3. Go to **Docker** and scroll down to **Compose**. Click **Add New Stack** and name it `family-hub`.
4. Click the stack's cog › **Edit Stack** › **Advanced** and set the **stack directory** to `/mnt/user/appdata/family-hub-src`. Alternatively, paste the contents of `docker-compose.yml` into the compose editor and the contents of `.env` into the ENV editor.
5. Click **Compose Up**. The first build takes a few minutes.
6. Open **`http://192.168.1.201:3000`** and sign in as **Andrew** with your `ADMIN_PIN`.

You can do the same from the terminal without the plugin:
```bash
cd /mnt/user/appdata/family-hub-src
docker compose up -d --build
```

### Method B: build the image and add it as a normal Unraid container

1. Build the image in an Unraid terminal:
   ```bash
   cd /mnt/user/appdata/family-hub-src
   docker build -t family-hub:latest .
   ```
2. Go to **Docker › Add Container** (enable *Advanced View*, top right) and fill in:
   - **Name:** `family-hub`
   - **Repository:** `family-hub:latest`
   - **Network type:** `Bridge`
   - **WebUI:** `http://[IP]:[PORT:3000]/`
3. Click **Add another Path, Port, Variable…** for each of these:

   | Type | Name | Container | Host / value |
   |---|---|---|---|
   | Port | Web UI | `3000` | `3000` |
   | Path | Data | `/data` | `/mnt/user/appdata/family-hub` |
   | Variable | ADMIN_NAME | `ADMIN_NAME` | `Andrew` |
   | Variable | ADMIN_PIN | `ADMIN_PIN` | *your 4–8 digit PIN* |
   | Variable | SONARR_URL | `SONARR_URL` | `http://192.168.1.200:8989` |
   | Variable | SONARR_API_KEY | `SONARR_API_KEY` | *key* |
   | Variable | RADARR_URL | `RADARR_URL` | `http://192.168.1.200:7878` |
   | Variable | RADARR_API_KEY | `RADARR_API_KEY` | *key* |
   | Variable | LIDARR_URL | `LIDARR_URL` | `http://192.168.1.200:8686` |
   | Variable | LIDARR_API_KEY | `LIDARR_API_KEY` | *key* |
   | Variable | PLEX_URL | `PLEX_URL` | `http://192.168.1.202:32400` |
   | Variable | HA_URL | `HA_URL` | *your Home Assistant URL* |
   | Variable | HA_TOKEN | `HA_TOKEN` | *long-lived token* |
   | Variable | HA_ENTITIES | `HA_ENTITIES` | `light.living_room,sensor.outdoor_temperature` |
   | Variable | TZ | `TZ` | `Europe/London` |

   Every other variable in `.env.example` is optional.
4. Click **Apply**, then open the WebUI.

> The container runs as `nobody:users` (99:100), the usual Unraid convention. If you created the appdata folder by hand as root and the container can't write to it, run `chown -R 99:100 /mnt/user/appdata/family-hub`.

### Updating
Copy the new source over the old one in `/mnt/user/appdata/family-hub-src` (keep your `.env`), then run these three commands in the Unraid terminal:

```bash
cd /mnt/user/appdata/family-hub-src && docker build -t family-hub .
docker rm -f family-hub
docker run -d --name family-hub --restart unless-stopped -p 3000:3000 -v /mnt/user/appdata/family-hub-data:/data --env-file /mnt/user/appdata/family-hub-src/.env family-hub
```

Your family members, PINs, requests and settings live in `/mnt/user/appdata/family-hub-data` (mounted as `/data`), so removing and re-creating the container doesn't lose anything. If you use Docker Compose instead, `docker compose up -d --build` does the same.

### Add to your phone's home screen
Open `http://192.168.1.201:3000` on the phone (it needs to be on your home Wi-Fi), then:

- **iPhone / iPad (Safari):** tap **Share** › **Add to Home Screen** › **Add**.
- **Android (Chrome):** tap the **⋮** menu › **Install app** (or **Add to Home screen**).

It opens full-screen with the Family Hub icon, like a normal app. Everyone still signs in with their own PIN.

---

## Running it somewhere else

Nothing is tied to `192.168.1.201`. On any machine with Docker (another Unraid box, a Pi 4/5, a Linux PC or a NAS):

```bash
cp .env.example .env    # edit it
# change DATA_PATH in .env to a local folder, e.g. ./data
docker compose up -d --build
```

Then open `http://<that-machine's-IP>:3000`. If port 3000 is taken, set `HOST_PORT=8085` (for example). The service URLs in `.env` must be reachable **from that machine**.

To try it with no services at all, set `DEMO_MODE=true`.

For local development without Docker (Node 20+):
```bash
npm install
DEMO_MODE=true DATA_DIR=./data ADMIN_PIN=1234 npm run dev
```

---

## Configuration reference

All settings are environment variables. See `.env.example` for the full annotated list. Some can also be changed in **Admin › Settings** at runtime, and the values set there are stored in the database and override the environment.

| Variable | Default | Notes |
|---|---|---|
| `DEMO_MODE` | `false` | Mock data, so no real services are contacted |
| `ADMIN_NAME` / `ADMIN_PIN` | `Andrew` / – | Only used to create the first admin when the database is empty. Without a valid PIN, a random one is printed to the container log. |
| `COOKIE_SECURE` | `false` | Set to `true` **only** behind HTTPS |
| `SESSION_DAYS` | `30` | How long people stay signed in |
| `REQUIRE_APPROVAL` | `false` | Initial value of the approval toggle |
| `SONARR_URL`, `RADARR_URL`, `LIDARR_URL` | `http://192.168.1.200:{8989,7878,8686}` | |
| `*_API_KEY` | – | Required for each *arr app you want to use |
| `*_ROOT_FOLDER`, `*_QUALITY_PROFILE_ID`, `LIDARR_METADATA_PROFILE_ID` | first available | Can also be picked from dropdowns in Settings |
| `PLEX_URL` / `PLEX_TOKEN` | `http://192.168.1.202:32400` / – | |
| `HA_URL` / `HA_TOKEN` / `HA_ENTITIES` | placeholder / – / – | |
| `*_PUBLIC_URL` | same as the URL | Link used on the dashboard, if different |
| `TMDB_API_KEY` | – | Optional. Better recommendations (see *TMDB* above) |
| `TMDB_REGION` / `TMDB_LANGUAGE` | `GB` / `en-GB` | Region and language for TMDB results |
| `REC_CACHE_HOURS` | `6` | How long recommendations are cached |
| `DATA_DIR` | `/data` | Where the SQLite database lives |

---

## Security notes

- API keys and tokens are only read by the server. The browser only ever talks to Family Hub, and the settings page only shows *whether* each key is set.
- Sessions use a random 256-bit token in an `HttpOnly`, `SameSite=Lax` cookie. Only a SHA-256 hash of the token is stored. Signing out deletes the session. Removing a family member signs them out everywhere.
- Every state-changing API call must be `application/json`. Together with `SameSite=Lax`, this blocks cross-site request forgery.
- PIN attempts are rate-limited per profile (5 failures → 15-minute lockout).
- Family Hub is designed for your **LAN**. Don't port-forward it to the internet. If you want remote access, use a VPN (WireGuard, Tailscale) or a reverse proxy with HTTPS, and set `COOKIE_SECURE=true`.

---

## Troubleshooting

- **A tile says Offline.** Hover over it to see the error, e.g. `unreachable (ECONNREFUSED)` or `HTTP 401`. A 401 means the API key is wrong. Check that the URL works from the Family Hub server: `curl http://192.168.1.200:8989/ping`.
- **A request shows "Failed".** The error is shown on the request, e.g. no root folder or a profile problem. Fix it in Admin › Settings, then press **Retry** on the All requests page.
- **Forgotten admin PIN.** If another admin exists, they can reset it. Otherwise stop the container, delete `/mnt/user/appdata/family-hub/family-hub.db*`, set `ADMIN_PIN` and start again. This removes all profiles and requests.
- **No recommendations, or only TV ones.** Check Admin › Settings › TMDB. Without a key, films need Radarr to be connected. A wrong key shows as a hint on the Discover page (for admins), and TV falls back to TVmaze.
- **The phone layout looks old after updating.** Close the home-screen app fully and reopen it, or refresh the page in the browser.
- **"Home Assistant is not configured".** Set both `HA_URL` and `HA_TOKEN`, then restart the container.

---

## Tech

Next.js 15 (App Router, standalone output) with TypeScript and Tailwind CSS, and SQLite via `better-sqlite3`. There are no third-party analytics, Google services or payment integrations.
