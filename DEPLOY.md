# Deploy ColorCompass to GitHub Pages

Full PowerShell commands from scratch. Nothing assumed.

## Option A: Standalone Repository (Recommended)

Makes it live at `https://madhumithachalla.github.io/colorcompass/`

### Step 1: Create the repo on GitHub.com
- Go to https://github.com/new
- Repository name: `colorcompass`
- Public, no README, no .gitignore, no license
- Click **Create repository**

### Step 2: In PowerShell, from the extracted zip folder:

```powershell
cd $HOME\Downloads\colorcompass
git init
git branch -M main
git config user.name "madhumithachalla"
git config user.email "mcha0218@student.monash.edu"
git add .
git commit -m "Initial commit: ColorCompass AI personal style app"
git remote add origin https://github.com/madhumithachalla/colorcompass.git
git push -u origin main
```

### Step 3: Enable GitHub Pages
- Go to https://github.com/madhumithachalla/colorcompass/settings/pages
- Source: **Deploy from a branch**
- Branch: **main** / **/ (root)**
- Click **Save**

Live within 1-3 minutes at:
**https://madhumithachalla.github.io/colorcompass/**

---

## Option B: Subfolder on Your Existing Portfolio

Makes it live at `https://madhumithachalla.github.io/colorcompass/` as part of your main site.

```powershell
cd $HOME
git clone https://github.com/madhumithachalla/madhumithachalla.github.io.git
cd madhumithachalla.github.io
New-Item -ItemType Directory -Force -Path colorcompass
Copy-Item -Path "$HOME\Downloads\colorcompass\*" -Destination colorcompass\ -Exclude DEPLOY.md
git config user.name "madhumithachalla"
git config user.email "mcha0218@student.monash.edu"
git add colorcompass/
git commit -m "Add ColorCompass: AI personal style and colour analysis app"
git push origin main
```

Live at: **https://madhumithachalla.github.io/colorcompass/**

---

## Add to Your Portfolio Homepage

Open `index.html` on your main portfolio repo and find the "Projects" section. Paste the contents of `portfolio_card.html` as a new project tile.

Then commit:

```powershell
cd $HOME\madhumithachalla.github.io
git add index.html
git commit -m "Add ColorCompass to portfolio projects"
git push origin main
```

## Local Testing

Before deploying, test locally:

```powershell
cd $HOME\Downloads\colorcompass
python -m http.server 8000
# Open http://localhost:8000 in your browser
```
