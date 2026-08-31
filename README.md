# Lauryn Haines — site

Four things. No build step, no framework, no server.

```
index.html      the site
admin.html      your editor (not linked from anywhere)
works.js        all the data — art, prices, statuses, copy, settings
images/         photos
```

`index.html` reads `works.js` and builds the pages from it. `admin.html` edits `works.js`.
Nothing is hardcoded.

`preview.html` is a throwaway snapshot for viewing in chat. **Do not put it in the repo.**

---

## Setup

### 1. Build the folder on your PC

```
lauryn/
  index.html
  admin.html
  works.js
  images/
    bighorn.jpg
```

### 2. Get the one photo you need to start

The site ships with an empty gallery on purpose — you add art one piece at a time
from the admin, on whatever device you're holding. The only file you need up front
is her portrait for the Home page. In the `lauryn` folder:

```bash
mkdir -p images && cd images
curl -L -o portrait.jpg "https://laurynhaines.com/assets/images/image01.jpg?v=f1feaf88"
```

No terminal? Open laurynhaines.com, long-press or right-click the round photo,
Save Image As, name it `portrait.jpg`, put it in `images/`.

### 3. Check it locally

Double-click `index.html`. Her portrait should be on Home, About and Contact should
read correctly, and Art and Shop should say new work is coming. That's the right
starting state.

### 4. Set the basics

Open `admin.html` (same folder) → **Site settings**. Put your own email in the contact
field for now. Everything else is already filled in.

Hit **Download works.js** and replace the old one.

### 5. Put it online

New GitHub repo called `lauryn` → drag the folder contents in → Settings → Pages →
Source `main`, folder `/ (root)`. A minute later you're live at
`https://YOURNAME.github.io/lauryn/`, with the editor at `.../lauryn/admin.html`.

Leave `laurynhaines.com` pointed at Carrd for now.

### 6. Turn on the contact form

Sign up at formspree.io, create a form, copy the ID out of the endpoint URL, paste it
into admin → Site settings → Formspree form ID. Publish, then send yourself a test
message and confirm it arrives.

### 7. Show her, then switch the domain

Once she's happy: GitHub repo → Settings → Pages → Custom domain → `laurynhaines.com`.
At your registrar, point the A records to `185.199.108.153`, `185.199.109.153`,
`185.199.110.153`, `185.199.111.153`, and CNAME `www` to `YOURNAME.github.io`.
Tick **Enforce HTTPS** once it validates. Give it up to an hour.

---

## Publishing from your phone

Admin → *Publishing setup*: your GitHub username, repo (`lauryn`), branch (`main`),
path (`works.js`), and a token.

Token: GitHub → Settings → Developer settings → **Personal access tokens** →
**Fine-grained tokens** → Generate new. Repository access: only `lauryn`.
Repository permissions: **Contents → Read and write**. Nothing else. Copy it once.

Paste it in, Save settings. It's stored in that browser only — never in the repo,
never on the live site. Now **Publish** writes straight to GitHub from anywhere.
If it ever leaks, the worst case is someone edits this one file. Revoke and reissue.

Without a token, **Download works.js** does the same job — it just needs a computer.

---

## Day-to-day

**Mark a piece sold** — open admin, tap `sold`, Publish. It stays on the site with a
Sold tag, the price is replaced, and its link becomes "Commission something like it."
Sold work is worth keeping visible; it's the strongest proof a buyer has that other
people are buying.

**Statuses** — `available` (price shows, no tag), `reserved`, `sold`, `commissioned`
(for murals and client work, so no price appears).

**Add a piece from your phone** — *+ Add a piece* → title, year, medium, size, price →
*Replace image from this device* → pick the photo. It's resized to 1600px in the browser,
so the file stays small. Set the status and the in-shop toggle, then Publish. About a
minute later it's on the site.

**Watch the size counter** in the admin header. Photos added from a device are stored
inside `works.js` itself. That's fine for a few dozen pieces — it turns amber past about
3.5 MB. If it gets there, move the biggest images into the `images/` folder and point
the image field at the file path instead.

**Hide without deleting** — the Hide button, for work that isn't photographed well yet.

---

## Known limits

- **One URL.** The whole site is one page swapping views, so Google indexes it as a
  single page. Fine for now.
- **Admin is unlisted, not locked.** Anyone with the URL can open the editor, but they
  can't publish without your token. `noindex` keeps it out of search results.
- **Inquire emails you.** It prefills the contact form rather than taking payment.
  Stripe Payment Links are the easy upgrade when she wants to sell prints directly.
