# Putting Baty Recipes online with GitHub Pages

This takes about 15 minutes the first time. You'll use the **GitHub Desktop** app on your computer and **Safari** on your iPhone. It's all free.

Some words you'll see:
- **Repository ("repo")**: a project folder stored on GitHub.
- **Commit**: a saved snapshot of your changes, with a short note.
- **Push**: send your commits from your computer up to GitHub.
- **GitHub Pages**: GitHub's free website hosting. It serves the files in your repo as a website.

---

## Step 1 — A GitHub account

If you already have one, skip to Step 2.

1. Go to https://github.com/signup and follow the steps. Choose your **username** carefully: it becomes part of your site address (`username.github.io`).
2. Verify your email address when GitHub asks.
3. Open **GitHub Desktop**. Choose **File → Options → Accounts → Sign in** (on a Mac: GitHub Desktop → Settings → Accounts) and sign in with that account.

## Step 2 — Turn the folder into a repository and publish it

1. In GitHub Desktop, choose **File → Add local repository…**
2. Click **Choose…** and pick the `baty-recipes` folder in your **Downloads**.
3. GitHub Desktop will say *"This directory does not appear to be a Git repository"*. Click the blue **create a repository** link in that message.
4. On the "Create a repository" screen:
   - **Name:** `baty-recipes`. This becomes part of the address.
   - Leave everything else as it is. Click **Create repository**.

   This saves a first snapshot (a "commit") of all the files.
5. Click **Publish repository** (top bar).
6. **Untick "Keep this code private".** GitHub Pages is only free for public repositories. Then click **Publish repository**.

Your files are now on GitHub. Check by choosing **Repository → View on GitHub**. Your browser will open the repo and you'll see the files listed.

> The `.gitignore` file tells GitHub Desktop to leave out a small settings folder (`.claude`) that's only used on this computer.

## Step 3 — Turn on GitHub Pages and find your address

1. On the repo's GitHub page, click **Settings** (the tab with a cog, along the top).
2. In the left menu, click **Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**.
4. Under **Branch**, choose **main**, leave the folder as **/ (root)**, and click **Save**.
5. Wait 1–2 minutes and refresh the page. A box appears at the top: **"Your site is live at https://YOUR-USERNAME.github.io/baty-recipes/"**. That's your app's address.
   - Seeing a 404 page? Wait another minute or two. The first publish can be slow.

## Step 4 — Install it on your iPhone

1. Open **Safari** (not Chrome) on the iPhone and go to `https://YOUR-USERNAME.github.io/baty-recipes/`.
2. Wait until the recipes appear. The app is now saving a copy for offline use.
3. Tap the **Share** button (the square with an arrow pointing up, at the bottom of the screen; on some iPhones it's behind the **⋯** button).
4. Scroll down and tap **Add to Home Screen**. Check the name says *Baty Recipes* and tap **Add**.
5. Open the app from the Home Screen icon (the kookaburra in a chef's hat) and use it from there from now on.

> **Important:** the Home Screen app and Safari keep **separate** data. Favourites added in Safari won't appear in the Home Screen app. Use the Home Screen app.

**Test offline:** open the app once while online, then turn on Aeroplane Mode and open it again. The recipes should still be there.

Other family members can install it the same way: just send them the link.

## Step 5 — Updating later

### Changing recipes

1. Replace `recipes.json` in `Downloads\baty-recipes` with the new version. Keep each recipe's `id` the same, or saved favourites and notes for it are lost.
2. Open `sw.js` in Notepad and change the version on this line, e.g. `1.0.0` → `1.0.1`:

   ```js
   const VERSION = '1.0.0';
   ```

3. Open GitHub Desktop. It lists the changed files on the left.
4. Type a short summary bottom-left (e.g. "Add Nan's scones"), click **Commit to main**, then click **Push origin** (top bar).
5. About a minute later, the site is updated.

### Making sure the iPhone gets the new version

The app keeps a saved copy of itself so it works offline. That copy is labelled with the `VERSION` number in `sw.js`. When you change that number:

1. Open the app on the iPhone while online. It checks GitHub for a newer `sw.js`.
2. It downloads the new version in the background and shows **"A new version of the app is ready — Update now"**.
3. Tap **Update now**. The app reloads with the changes.

If you don't see the message, fully close the app (swipe up from the bottom and flick it away), open it again, and wait a few seconds.

Your favourites, notes, lists and plans are **not** affected by updates.

> If you forget to bump the version: recipe changes in `recipes.json` still arrive next time the phone is online. Changes to the app's look or features won't arrive until the version changes.

## Moving to a new phone

On the old phone: **Settings → Export my data**, and save the file (e.g. to Files/iCloud Drive, or AirDrop/email it). On the new phone: install the app (Step 4), then **Settings → Import a backup** and choose the file.

## If something goes wrong

- **Site shows 404:** check Settings → Pages says "Your site is live", and that `index.html` is at the top level of the repo, not inside another folder.
- **Old version keeps showing:** bump `VERSION` in `sw.js`, push, then close and reopen the app.
- **Want to undo a change:** in GitHub Desktop, open the **History** tab, right-click the commit and choose **Revert changes in commit**. Then **Push origin**.
