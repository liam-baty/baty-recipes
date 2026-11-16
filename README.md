# Baty Recipes

The Baty family recipe book as an iPhone-friendly web app. It installs to the Home Screen, works offline, and keeps your favourites, notes, shopping list and meal plans on your phone.

- **Hosting:** GitHub Pages (free). Step-by-step guide: [HOSTING.md](HOSTING.md)
- **No build step:** plain HTML, CSS and JavaScript. Edit a file, publish it, done.
- **Recipes:** all 135 come from `recipes.json`, unchanged.

## What's in the folder

```
index.html               The app's single page (noindex tag, icons, manifest link)
manifest.webmanifest     Makes it installable: name, icons, full-screen "standalone" mode
sw.js                    Service worker: offline copy of every file + version number
robots.txt               Asks search engines to stay away (see note below)
recipes.json             The recipe book data
css/app.css              All styling: colours, light/dark mode, text sizes, layout
css/print.css            Clean single-recipe print layout
icons/                   App icon (icon.svg is the original drawing; PNGs are made from it)
tests/index.html         Automatic checks: open it in a browser to run them
js/
  app.js                 Start-up, page routing (#/recipe/…), update prompt
  storage.js             Saves your data on the phone (safely), export/import
  data.js                Loads recipes, applies your edits, search, "What can I make"
  ingredients.js         Reads quantities, scaling, fractions, merging, shop sections
  shoplist.js            Shopping list logic
  timers.js              Finds times in method steps, runs timers, alarm
  share.js               Share sheet, copy, email fallback
  util.js                Small helpers (dates, dialogs, messages)
  views/                 One file per page:
    home.js              Search, filters, browse, What can I make, What's for dinner
    recipe.js            Recipe page (scaler, timers, notes, rating, plan, share, print)
    cook.js              Cook mode
    shopping.js          Shopping list page
    planner.js           Meal planner
    settings.js          Settings, pantry staples, backup
    edit.js              Edit a recipe / add your own
```

## Run it on your computer

Browsers block apps like this when opened straight from a file (double-clicking `index.html` won't work), so start a small local web server. Python is already installed on this computer.

1. Open PowerShell in the `baty-recipes` folder. In File Explorer, open the folder, click the address bar, type `powershell` and press Enter.
2. Run:

   ```bash
   python -m http.server 8080
   ```

3. Open http://localhost:8080 in your browser. The checks are at http://localhost:8080/tests/
4. Press `Ctrl + C` in PowerShell to stop the server.

Tip: the offline cache can keep showing old files while you're editing. In Edge or Chrome, press F12, go to Application → Service workers, and tick **Update on reload**.

## Updating the recipes

1. Replace `recipes.json` with the new version. Keep the same structure (see the brief).
2. **Keep each recipe's `id` the same.** Favourites, notes, ratings and plans are linked to the id. If an id changes, the saved data for that recipe is lost.
3. Run the checks (`tests/index.html`). They confirm the recipe count, that every group has recipes, and that every `related` link exists.
4. Bump the version in `sw.js` and publish. See "Publishing changes" below.

Your edits made in the app (Edit button) are saved on the phone as changes on top of `recipes.json`. If you later update a recipe in `recipes.json`, any field you edited on the phone still shows your version. "Revert to book" on the edit page removes your changes.

To mark a recipe for checking, set `"needsCheck": true`. It then shows a "check against the book" badge.

## Publishing changes (redeploy)

1. Make your changes.
2. Open `sw.js` and change the version number, e.g. `const VERSION = '1.0.0';` to `'1.0.1'`. This tells phones there's a new version.
3. If you added a new file, add it to the `FILES` list in `sw.js` too.
4. In **GitHub Desktop**: type a short summary (bottom left), click **Commit to main**, then **Push origin**.
5. GitHub Pages republishes in about a minute. On the iPhone, open the app. It shows **"A new version of the app is ready — Update now"**. Tap it. If it doesn't appear, close the app fully (swipe it away) and open it again.

## Your data

- Everything personal is saved **on the phone only**: favourites, ratings, notes, made-it dates, shopping list, meal plans, pantry staples, settings, your edits and recipes.
- **Safari and the Home Screen app keep separate data.** Pick the Home Screen app and stick with it.
- **Back up** with Settings → Export my data. The share sheet lets you "Save to Files". To move phones, use Settings → Import a backup on the new phone.
- If iPhone storage is blocked (e.g. Private Browsing), the app still works, but it warns you that changes won't be kept.

## Privacy note

`index.html` has a `noindex` tag, which tells search engines not to list the site. `robots.txt` asks them not to crawl it. Search engines only read `robots.txt` from the top level of a domain. For a site at `yourname.github.io/baty-recipes/`, the `noindex` tag is what actually does the work. Either way, **the site and the GitHub repository are public to anyone who has or guesses the link.** Don't put anything private in it.

## iPhone notes

- **Timers:** iPhone pauses web apps when the screen locks or you switch apps. Timers keep correct time and show the alert when you come back, but they can't beep while the app is in the background. Cook mode keeps the screen awake on recent iOS versions. Otherwise it suggests turning Auto-Lock off while cooking.
- **Vibration:** iPhones don't allow web apps to vibrate, so the alarm uses sound and a full-screen alert.
- **Share:** uses the iPhone share sheet (Messages, Mail, Notes, Reminders…). Where that isn't available, you get Copy and Email buttons instead.

## Customising

- **Supermarket sections:** the keyword lists are near the end of `js/ingredients.js` (`KEYWORDS`). Moving an item in the app is remembered too.
- **Pantry staples:** edit them in Settings. The starting list is `DEFAULTS.pantry` in `js/storage.js`.
- **Colours:** at the top of `css/app.css` (light mode, then dark mode).
- **Icon:** edit `icons/icon.svg`, then re-create the PNGs at 180, 192 and 512 px. Any SVG-to-PNG tool works. The maskable icon has the artwork at 80% size, so Android can crop it to a circle.
