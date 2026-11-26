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
- **Push notifications** via [ntfy](https://ntfy.sh): "your request was approved / declined / is ready to watch", and "a new request needs approval" for admins. Everyone has their own private topic and chooses which alerts they get (see [Notifications](#3-notifications-ntfy)).
- **Automatic updates from GitHub.** Every push to `main` builds a fresh image at `ghcr.io/axletime/family-hub:latest`, which Watchtower can pull for you (see [Updating via GitHub](#updating-via-github-recommended)).
- **Phone-friendly, installable app.** A bottom tab bar on phones (with a **More** sheet for admin pages, account and sign-out), large tap targets, iPhone notch support, and no zooming into text boxes. Add it to your home screen and it opens full-screen like an app (see *Add to your phone's home screen* below).
- **Looks and works on any screen:** responsive for phones, tablets, desktops and TVs. Dark theme by default with a light option. Accent colour `#1B4F8A`.
- **Demo mode** (`DEMO_MODE=true`) shows realistic mock data, so you can try the UI before connecting anything.

---

## 1. Get your API keys and tokens

You no longer need to edit `.env` for these. Sign in as an admin and open **Admin › Settings › Connections** (on a phone: **More › Connections & API keys**). Paste each address and key, press **Test connection**, then **Save**. Changes apply straight away, with no restart. See [Connections page](#connections-page) below for how it works.

### Sonarr, Radarr and Lidarr
In each app go to **Settings › General**. Under **Security** (on older versions, **Security / API**) copy the **API Key**. If it's hidden, tick *Show Advanced* at the top.

- Sonarr: `http://192.168.1.200:8989/settings/general` → Connections › Sonarr › API key
- Radarr: `http://192.168.1.200:7878/settings/general` → Connections › Radarr › API key
- Lidarr: `http://192.168.1.200:8686/settings/general` → Connections › Lidarr › API key

### Home Assistant long-lived access token
1. In Home Assistant, click your **profile** (your name, bottom-left of the sidebar).
2. Open the **Security** tab.
3. Scroll to **Long-lived access tokens** and click **Create token**.
4. Name it `Family Hub` and copy the token straight away (it is only shown once).
5. Paste it into **Connections › Home Assistant**, together with your Home Assistant address, e.g. `http://192.168.1.50:8123`.

> The token has the same rights as the user who created it. To limit what Family Hub can do, create a separate non-admin Home Assistant user for it. Family Hub will only control entities that are on its dashboard list: it toggles lights, switches, fans and input booleans, and sets heating and hot water (see below).

To find entity IDs, go to **Settings › Devices & services › Entities** in Home Assistant. Examples: `light.living_room`, `sensor.outdoor_temperature`, `person.andrew`.

### Hive heating and hot water (optional)
1. In Home Assistant, add the **Hive** integration (**Settings › Devices & services › Add integration › Hive**). This creates a `climate.*` entity for the heating and a `water_heater.*` entity for the hot water.
2. In Family Hub, go to **Admin › Settings › Home Assistant entities**. Under **Heating & hot water**, switch on the entities you want, then press **Save entities**. Your existing lights and switches stay as they are.
3. The dashboard now shows a **Heating** card and a **Hot water** card:
   - **Heating:** current and target temperature, − / + in 0.5° steps, Heat / Schedule / Off, whether the heating is on right now, and **Boost** for 30 min, 1 hour or 2 hours at a temperature you choose (with **Cancel boost**).
   - **Hot water:** Schedule / On / Off, and **Boost** for 30 min or 1 hour.
4. **Family members can control heating** (Admin › Settings, on by default) controls whether non-admins can change these. When it is off, they see the cards read-only.

Family Hub calls Home Assistant from the server, using a fixed list of allowed services, and only for entities on its list. If the `hive.*` boost services are missing, heating boost falls back to the thermostat's own boost preset. Hive works through its cloud, so changes can take a few seconds to show.

### Plex (optional)
Family Hub checks `PLEX_URL/identity`, which normally works without a token. If your server needs one, see Plex's guide *"Finding an authentication token / X-Plex-Token"* and paste it into **Connections › Plex**.

### TMDB (optional, for better recommendations)
Recommendations work without this, but a free TMDB key gives the personalised "Because you have …" rows for both TV and films.

1. Create a free account at [themoviedb.org](https://www.themoviedb.org/signup) and confirm your email.
2. Click your avatar › **Settings** › **API** (or go to `https://www.themoviedb.org/settings/api`).
3. Click **Create** / **Request an API key**, choose **Developer**, accept the terms and fill in the short form. For personal use, "Family Hub – home media requests" is fine as the description, and you can use any URL (e.g. `http://192.168.1.201:3000`).
4. Copy the **API Key** (the short one). The long **API Read Access Token** also works.
5. Paste it into **Admin › Settings › Connections › TMDB**, press **Test connection**, then **Save**. Recommendations refresh straight away.

The Connections page shows whether the key is set. The key is only used by the server, and results are cached for 6 hours (`REC_CACHE_HOURS`).

**Without a key:** TV recommendations come from TVmaze (no key needed) and film recommendations come from Radarr's own discover lists. If neither is available, admins see a hint on the Discover page and the dashboard carries on as normal.

Requests from recommendations go through Sonarr/Radarr lookups (TVDB ID for Sonarr, TMDB ID for Radarr), exactly like a normal search.

### Connections page

**Admin › Settings › Connections** has a section for Sonarr, Radarr, Lidarr, Plex, Home Assistant, TMDB, ntfy, the webhook shared secret and the hub's public address. Only admins can open it.

- **Where values come from.** A value saved on this page takes priority. If nothing is saved, the value from `.env` is used, and failing that the built-in default. Each field shows a badge: **Saved in hub**, **.env** or **Not set**. Existing setups with keys in `.env` keep working unchanged.
- **Keys stay hidden.** Saved keys and tokens are never sent back to the browser. You only see the last four characters, e.g. `••••••••abcd`. Leave a key field blank when saving to keep the current one.
- **Clear.** Removes the value saved in the hub so the `.env` value (or the default) applies again.
- **Test connection.** Runs on the server, using what you have typed even if it isn't saved yet. A blank key field uses the current key. You get the version on success, or a readable error such as `unreachable (ECONNREFUSED)` or `HTTP 401 — the key or token was rejected`. The ntfy test publishes to a throwaway topic. In demo mode, nothing is contacted.
- **Applies straight away.** Status tiles, library lookups, recommendations and the download checker pick up the change without a restart.
- **Encryption.** Keys are stored in the SQLite database encrypted with AES-256-GCM. The encryption key is taken from `APP_SECRET`, if set. Otherwise it is generated on first use and kept in `/data/.secret-key` (readable only by the container user). **Back up that file along with the rest of the data folder.** If the key file is lost or `APP_SECRET` changes, saved keys can't be read. The page then falls back to `.env` and marks those fields so you can re-enter them.

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
   nano .env        # only ADMIN_PIN is needed; add API keys later in Admin › Settings › Connections
   ```
3. Go to **Docker** and scroll down to **Compose**. Click **Add New Stack** and name it `family-hub`.
4. Click the stack's cog › **Edit Stack** › **Advanced** and set the **stack directory** to `/mnt/user/appdata/family-hub-src`. Alternatively, paste the contents of `docker-compose.yml` into the compose editor and the contents of `.env` into the ENV editor.
5. Click **Compose Up**. The first build takes a few minutes.
6. Open **`http://192.168.1.201:3000`** and sign in as **Andrew** with your `ADMIN_PIN`.
7. Go to **Admin › Settings › Connections** and add your addresses and API keys.

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
   | Variable | TZ | `TZ` | `Europe/London` |

   That's all that's required. Add the service addresses and API keys afterwards in **Admin › Settings › Connections**. Every other variable in `.env.example` is optional and acts as a fallback.
4. Click **Apply**, then open the WebUI.

> The container runs as `nobody:users` (99:100), the usual Unraid convention. If you created the appdata folder by hand as root and the container can't write to it, run `chown -R 99:100 /mnt/user/appdata/family-hub`.

### Updating via GitHub (recommended)
The source code lives at **https://github.com/axletime/family-hub**. Every push to `main` makes GitHub Actions build the Docker image and publish it to the GitHub Container Registry as:

- `ghcr.io/axletime/family-hub:latest` (always the newest)
- `ghcr.io/axletime/family-hub:sha-<commit>` (one per commit, handy for rolling back)

You can also start a build by hand from the repo's **Actions** tab (**Build and publish Docker image › Run workflow**).

**One-off: switch on the build workflow (about 1 minute).** GitHub only lets the repo owner add workflow files, so the workflow is shipped as [`deploy/docker-image.yml`](deploy/docker-image.yml) and needs adding once from the GitHub website:

1. Open [`deploy/docker-image.yml`](deploy/docker-image.yml) on GitHub and click the **Copy raw file** button.
2. Go to the repo's main page and click **Add file › Create new file**.
3. Name it exactly `.github/workflows/docker-image.yml` (typing the `/` characters creates the folders), paste, and click **Commit changes…** to `main`.
4. That commit starts the first build straight away. Watch it under the **Actions** tab. It takes about 3–5 minutes.

**One-off: make the image downloadable.** New GHCR packages are private. After the first successful build, open **github.com/axletime → Packages → family-hub → Package settings → Change visibility → Public**. The image contains no secrets: your keys stay in `.env` on Unraid. If you'd rather keep it private, log in once on Unraid with a GitHub personal access token (classic) that has the `read:packages` scope:

```bash
docker login ghcr.io -u axletime
```

**Switch the container to the GitHub image** (run once in the Unraid terminal). Your `.env` stays where it is and your data folder is untouched:

```bash
docker pull ghcr.io/axletime/family-hub:latest
docker rm -f family-hub
docker run -d --name family-hub --restart unless-stopped -p 3000:3000 -v /mnt/user/appdata/family-hub-data:/data --env-file /mnt/user/appdata/family-hub-src/.env ghcr.io/axletime/family-hub:latest
```

**Automatic updates with Watchtower.** This checks once an hour and only ever touches the `family-hub` container:

```bash
docker run -d --name watchtower --restart unless-stopped -v /var/run/docker.sock:/var/run/docker.sock containrrr/watchtower family-hub --interval 3600 --cleanup
```

When a new image appears, Watchtower re-creates `family-hub` with the same ports, volume and environment and removes the old image. If the image is private, add `-v /root/.docker/config.json:/config.json` so Watchtower can use your `docker login`. If `docker logs watchtower` says the client version is too old for your Docker, add `-e DOCKER_API_VERSION=1.44`.

**Manual update in one line** (no Watchtower):

```bash
docker pull ghcr.io/axletime/family-hub:latest && docker rm -f family-hub && docker run -d --name family-hub --restart unless-stopped -p 3000:3000 -v /mnt/user/appdata/family-hub-data:/data --env-file /mnt/user/appdata/family-hub-src/.env ghcr.io/axletime/family-hub:latest
```

**Rolling back:** run the same command with `:sha-<commit>` instead of `:latest` (the tags are listed on the package page).

### Updating by building it yourself
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

## 3. Notifications (ntfy)

Family Hub can send push notifications to everyone's phone using [ntfy](https://ntfy.sh), a free, open-source notification service. No accounts, email addresses or phone numbers are involved.

**Who gets what:**

| Event | Who is notified |
|---|---|
| A request is approved | The person who asked for it |
| A request is declined (with the reason, if one was given) | The person who asked for it |
| A request is ready to watch or listen to | The person who asked for it |
| A family member makes a request that needs approval | Admins |

Each notification has the title, a short message, the poster (as an icon on Android and an image attachment on both platforms) and a link straight to the hub. Each notification is sent only once (this is recorded in the database). If ntfy can't be reached, the request still goes through as normal and the failure is shown under **Admin › Settings › Recent notifications**.

### How "ready to watch" works
A background check runs every 5 minutes (`NOTIFY_POLL_MINUTES`) even when nobody has the hub open. It asks Sonarr, Radarr and Lidarr whether the requested title has files yet (a film file, at least one episode file, or at least one track file). You don't need to set up anything in the *arr apps. For instant alerts you can also add the optional webhooks below.

### Step 1: choose an ntfy server

**Option A: self-hosted on Unraid (recommended).** Everything stays on your network. Paste this into the Unraid terminal:

```bash
docker run -d --name ntfy --restart unless-stopped -p 8080:80 \
  -v /mnt/user/appdata/ntfy/cache:/var/cache/ntfy \
  -v /mnt/user/appdata/ntfy/etc:/etc/ntfy \
  -e TZ=Europe/London \
  -e NTFY_BASE_URL=http://192.168.1.201:8080 \
  -e NTFY_CACHE_FILE=/var/cache/ntfy/cache.db \
  -e NTFY_ATTACHMENT_CACHE_DIR=/var/cache/ntfy/attachments \
  -e NTFY_UPSTREAM_BASE_URL=https://ntfy.sh \
  binwiederhier/ntfy serve
```

Then set the ntfy server to `http://192.168.1.201:8080` under **Admin › Settings › Connections › ntfy** (or `NTFY_URL` in `.env`). `NTFY_UPSTREAM_BASE_URL` lets the iPhone app get instant alerts from a self-hosted server. Only a "wake up" ping goes via ntfy.sh, never the message itself.

**Option B: the public ntfy.sh server.** Nothing to install. Leave `NTFY_URL` as `https://ntfy.sh`. Each person's topic has a long random suffix, so nobody can guess it, but anyone who learns a topic name could read its alerts.

> **Alerts away from home:** a self-hosted ntfy on `192.168.1.201` only works while the phone is on your home Wi-Fi (or VPN). For alerts anywhere, either use ntfy.sh, or expose your ntfy server securely (e.g. Tailscale/WireGuard, or a reverse proxy with HTTPS and an access token).

**Optional access token:** if you lock your ntfy server down (`auth-default-access: deny-all`), create a user and token with `docker exec -it ntfy ntfy user add --role=admin familyhub` and `docker exec -it ntfy ntfy token add familyhub`. Then set `NTFY_TOKEN=tk_...` (or paste it into Admin › Settings › Connections › ntfy, where it is stored encrypted and never shown again). Each phone then also needs a login in the ntfy app.

### Step 2: each person subscribes on their phone
1. Install the **ntfy** app: [iPhone](https://apps.apple.com/app/ntfy/id1625396347) or Android ([Play Store](https://play.google.com/store/apps/details?id=io.heckel.ntfy) / [F-Droid](https://f-droid.org/packages/io.heckel.ntfy/)).
2. In Family Hub, open **My account** (on a phone: **More › My account & PIN**). The **Phone notifications** card shows your private topic, a QR code and an "Open in ntfy app" link.
3. In the ntfy app tap **+**, type the topic and, if you're self-hosting, turn on **Use another server** and enter `http://192.168.1.201:8080`.
4. Choose which alerts you want with the toggles, then press **Send test notification**.

If a topic is ever shared by mistake, press **New topic** and subscribe again.

### Optional: instant "On Import" webhooks
1. Set the webhook shared secret in **Admin › Settings › Connections** to a long random string (e.g. `openssl rand -hex 24`). (`WEBHOOK_SECRET` in `.env` also works.)
2. In Sonarr go to **Settings › Connect › + › Webhook**. Tick **On Import** (called **On File Import** in newer versions, **On Download** in older ones; **On Release Import** in Lidarr). Set:
   - URL: `http://192.168.1.201:3000/api/webhooks/sonarr?secret=YOUR_SECRET`
   - Method: `POST`
3. Do the same in Radarr (`/api/webhooks/radarr`) and Lidarr (`/api/webhooks/lidarr`). If you'd rather not put the secret in the URL, leave `?secret=` off and put the secret in the webhook's **Password** field instead (any username).
4. Press **Test**. It should succeed. The background check still runs as a safety net.

### Demo mode
With `DEMO_MODE=true`, nothing is sent. Each notification is written to the container log (`docker logs family-hub`) and listed as "Logged (demo)" in Admin › Settings.

---

## 4. Backups

`deploy/backup-family-hub.sh` makes a dated `.tar.gz` of everything Family Hub needs to come back after a disk failure or a mistake:

- the whole data folder `/mnt/user/appdata/family-hub-data`: the database (`family-hub.db`), the encryption key `.secret-key` and anything else in there
- your `.env` from `/mnt/user/appdata/family-hub-src/.env`

The database is copied with SQLite's online backup **inside the running container** (using the app's own SQLite library), so Family Hub keeps running and nothing needs installing on Unraid. If that fails for any reason, the script stops the container for a few seconds, copies the files and starts it again. Each copy is checked with SQLite's `integrity_check` and the finished archive is checked with `tar` before old ones are deleted.

> ⚠️ **The archive contains your encryption key and all your API keys and tokens** (Sonarr, Radarr, Plex, Home Assistant…), plus the `.env`. Anyone with the archive can read them. Keep backups on the array or on **encrypted** off-site storage (for example an encrypted cloud backup or an encrypted USB disk). Never put them in a public share, a public cloud folder, a Git repo or an email. The script makes the backup folder readable by root only (`700`) and each archive `600`.

### Set it up with the User Scripts plugin

1. In Unraid, go to **Apps**, search for **User Scripts** (by Squid) and install it.
2. Go to **Settings › User Scripts › Add New Script** and name it `family-hub-backup`.
3. Hover over the cog next to the new script › **Edit Script**, delete what's there and paste **one** of these:
   - the full contents of [`deploy/backup-family-hub.sh`](deploy/backup-family-hub.sh) (best if you want to change the settings at the top), **or**
   - this one-liner, which always runs the latest version from GitHub:
     ```bash
     #!/bin/bash
     curl -fsSL https://raw.githubusercontent.com/axletime/family-hub/main/deploy/backup-family-hub.sh | bash
     ```
     Settings can be added in front of `bash`, e.g. `... | KEEP_DAYS=30 NTFY_TOPIC=familyhub-admin bash`.
4. Click **Save Changes**, then **Run Script** once and check the log ends with `Backup finished`.
5. In the schedule dropdown next to the script, choose **Custom** and enter `0 3 * * *` (every day at 03:00). Click **Apply**.

### Settings

All settings are at the top of the script (or can be passed as environment variables, as above):

| Setting | Default | Notes |
|---|---|---|
| `CONTAINER` | `family-hub` | Container name |
| `DATA_DIR` | `/mnt/user/appdata/family-hub-data` | Host folder mounted at `/data` |
| `ENV_FILE` | `/mnt/user/appdata/family-hub-src/.env` | Blank = don't include the `.env` |
| `DEST` | `/mnt/user/backups/family-hub` | Where archives go (created if missing) |
| `KEEP_DAYS` | `14` | Archives older than this are deleted (`0` = keep everything) |
| `ALLOW_STOP` | `yes` | Allow the brief stop/copy/start fallback |
| `NTFY_URL` / `NTFY_TOPIC` / `NTFY_TOKEN` | `https://ntfy.sh` / – / – | Set `NTFY_TOPIC` to get an ntfy alert when a backup **fails** (blank = off) |
| `NOTIFY_ON_SUCCESS` | `no` | `yes` = also send a quiet message after each good backup |

### Where the backups are

`/mnt/user/backups/family-hub/family-hub-YYYY-MM-DD_HHMMSS.tar.gz`, one per run. Each archive contains `data/` (the data folder), `env/.env` and a `MANIFEST.txt` describing when and how it was made. The log of each run is under the script's **Show Log** in User Scripts. The script exits with an error (and sends the ntfy alert, if set up) when anything goes wrong.

### Restoring

Restoring replaces the current data with the backup, so anything added since then is lost. The current data folder isn't deleted: it's moved aside to `family-hub-data.pre-restore-<time>`.

In the Unraid terminal:

```bash
curl -fsSL -o /tmp/restore-family-hub.sh https://raw.githubusercontent.com/axletime/family-hub/main/deploy/restore-family-hub.sh
ls /mnt/user/backups/family-hub/            # pick an archive
bash /tmp/restore-family-hub.sh /mnt/user/backups/family-hub/family-hub-2026-11-26_030000.tar.gz
```

It checks the archive, shows what it's going to do and asks you to type `yes`. Then it stops the container, puts the backed-up data in place, fixes ownership (`99:100`) and starts the container again. Options:

- `--with-env` also restores the `.env` (the current one is kept as `.env.pre-restore-<time>`). A changed `.env` only takes effect when the container is re-created with the `docker rm -f` + `docker run` commands from *Updating via GitHub*.
- `--yes` skips the confirmation.

Once the hub looks right, delete the `family-hub-data.pre-restore-<time>` folder.

**By hand**, if you'd rather not use the script: `docker stop family-hub`, rename `/mnt/user/appdata/family-hub-data`, then `mkdir /tmp/fh && tar -xzf <archive> -C /tmp/fh && mv /tmp/fh/data /mnt/user/appdata/family-hub-data && chown -R 99:100 /mnt/user/appdata/family-hub-data`, then `docker start family-hub`.

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

All settings can be environment variables; see `.env.example` for the full annotated list. **The minimum `.env` is just `ADMIN_PIN`** (plus `TZ`, and optionally `APP_SECRET`). The addresses, keys and tokens marked ★ can be set in **Admin › Settings › Connections** instead. Other options marked ☆ are in **Admin › Settings**. Values saved there are stored in the database and take priority over the environment, which remains the fallback.

| Variable | Default | Notes |
|---|---|---|
| `DEMO_MODE` | `false` | Mock data, so no real services are contacted |
| `APP_SECRET` | – | Optional. Encrypts keys saved on the Connections page. If unset, a key is generated in `/data/.secret-key`; keep that file with your data backups. Changing it means re-entering saved keys. |
| `ADMIN_NAME` / `ADMIN_PIN` | `Andrew` / – | Only used to create the first admin when the database is empty. Without a valid PIN, a random one is printed to the container log. |
| `COOKIE_SECURE` | `false` | Set to `true` **only** behind HTTPS |
| `SESSION_DAYS` | `30` | How long people stay signed in |
| `REQUIRE_APPROVAL` | `false` | Initial value of the approval toggle |
| `SONARR_URL`, `RADARR_URL`, `LIDARR_URL` ★ | `http://192.168.1.200:{8989,7878,8686}` | |
| `*_API_KEY` ★ | – | Required for each *arr app you want to use |
| `*_ROOT_FOLDER`, `*_QUALITY_PROFILE_ID`, `LIDARR_METADATA_PROFILE_ID` | first available | Can also be picked from dropdowns in Settings |
| `PLEX_URL` / `PLEX_TOKEN` ★ | `http://192.168.1.202:32400` / – | |
| `HA_URL` / `HA_TOKEN` ★ / `HA_ENTITIES` ☆ | placeholder / – / – | |
| `*_PUBLIC_URL` | same as the URL | Link used on the dashboard, if different |
| `TMDB_API_KEY` ★ | – | Optional. Better recommendations (see *TMDB* above) |
| `TMDB_REGION` / `TMDB_LANGUAGE` | `GB` / `en-GB` | Region and language for TMDB results |
| `REC_CACHE_HOURS` | `6` | How long recommendations are cached |
| `PUBLIC_URL` ★ | `http://192.168.1.201:3000` | Hub address used for links in notifications |
| `NOTIFICATIONS_ENABLED` | `true` | Master switch (also in Admin › Settings) |
| `NTFY_URL` ★ | `https://ntfy.sh` | ntfy server, e.g. `http://192.168.1.201:8080` |
| `NTFY_TOKEN` ★ | – | Optional ntfy access token (`tk_...`) or `user:password` |
| `NTFY_TOPIC_PREFIX` ☆ | `familyhub` | Start of each person's topic name |
| `NOTIFY_POLL_MINUTES` | `5` | How often to check for finished downloads |
| `WEBHOOK_SECRET` ★ | – | Enables the optional *arr import webhooks |
| `DATA_DIR` | `/data` | Where the SQLite database lives |

---

## Security notes

- API keys and tokens are only read by the server. The browser only ever talks to Family Hub. The Connections page shows only the last four characters of a key and never sends the key itself to the browser. Keys saved there are encrypted at rest (AES-256-GCM), and only admins can view, change or test them.
- Sessions use a random 256-bit token in an `HttpOnly`, `SameSite=Lax` cookie. Only a SHA-256 hash of the token is stored. Signing out deletes the session. Removing a family member signs them out everywhere.
- Every state-changing API call must be `application/json`. Together with `SameSite=Lax`, this blocks cross-site request forgery.
- PIN attempts are rate-limited per profile (5 failures → 15-minute lockout).
- Backup archives (see *Backups*) contain the encryption key and every saved token. Keep them private: on the array or on encrypted off-site storage.
- Family Hub is designed for your **LAN**. Don't port-forward it to the internet. If you want remote access, use a VPN (WireGuard, Tailscale) or a reverse proxy with HTTPS, and set `COOKIE_SECURE=true`.

---

## Troubleshooting

- **A tile says Offline.** Hover over it to see the error, e.g. `unreachable (ECONNREFUSED)` or `HTTP 401`. A 401 means the API key is wrong. Use **Test connection** on Admin › Settings › Connections, or check that the URL works from the Family Hub server: `curl http://192.168.1.200:8989/ping`.
- **A request shows "Failed".** The error is shown on the request, e.g. no root folder or a profile problem. Fix it in Admin › Settings, then press **Retry** on the All requests page.
- **Forgotten admin PIN.** If another admin exists, they can reset it. Otherwise stop the container, delete `/mnt/user/appdata/family-hub/family-hub.db*`, set `ADMIN_PIN` and start again. This removes all profiles and requests.
- **No recommendations, or only TV ones.** Check Admin › Settings › Connections › TMDB and press **Test connection**. Without a key, films need Radarr to be connected. A wrong key shows as a hint on the Discover page (for admins), and TV falls back to TVmaze.
- **The phone layout looks old after updating.** Close the home-screen app fully and reopen it, or refresh the page in the browser.
- **No notifications arrive.** Press **Send test notification** on My account. An error there (e.g. `ntfy unreachable (ECONNREFUSED)` or `HTTP 401`) means the server address or token is wrong. If the test says *sent* but nothing arrives, check the phone is subscribed to exactly the same topic and server, and that notifications are allowed for the ntfy app. With a self-hosted server, the phone must be on your home network.
- **"Home Assistant is not configured".** Add the address and token in Admin › Settings › Connections › Home Assistant.
- **Hot water boost says it is not available.** Hot water boost needs the Hive integration's `hive.boost_hot_water` service. Check the Hive integration is installed and loaded in Home Assistant.
- **A Connections field says the saved value could not be decrypted.** `APP_SECRET` changed or `/data/.secret-key` was lost. Re-enter the key, press **Clear** to go back to `.env`, or restore the data folder from a backup (see *Backups*).

---

## Tech

Next.js 15 (App Router, standalone output) with TypeScript and Tailwind CSS, and SQLite via `better-sqlite3`. There are no third-party analytics, Google services or payment integrations.
