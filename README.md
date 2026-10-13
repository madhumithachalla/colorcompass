# ColorCompass ✨

**AI-powered personal colour, style and climate-aware outfit recommendation web app.**

🔗 **Live Demo:** https://madhumithachalla.github.io/colorcompass/

## 🎯 What It Does

Upload a selfie → get an instant personalised beauty & style report covering:

| Tab | Feature |
|-----|---------|
| 🌱 Start | Beginner's 10-piece wardrobe + 5-step outfit formula |
| 🎨 Color | Full seasonal palette with hex codes (best / neutrals / accents / avoid) |
| 👕 Casual | 10 casual outfit ideas with specific items |
| 💼 Formal | 8 professional outfit ideas |
| ✨ Occasion | 10 special occasion outfits (wedding, Diwali, NYE etc.) |
| 💄 Makeup | Foundation (3 brand shade matches), blush, bronzer, highlighter, eyeshadow, liner, lips |
| ✏️ Placement | Zone-by-zone makeup application guide |
| 💇 Hair | Best shades, cuts, length, bangs, styling |
| 👓 Glasses | 4 frame shape SVGs + colour palette + brand picks |
| 🌦️ Climate | 7 weather-condition styling guides |
| 🛍️ Brands | 30+ AU-friendly shoppable brand recommendations |
| ⭐ Looks | 3 complete signature looks (everyday / office / evening) |

Plus a **live weather lookup** that generates outfit suggestions based on your current city's conditions.

## 🚀 Features

- 📸 **Live photo upload** — browser camera on mobile, file picker on desktop
- 🎨 **Client-side colour analysis** — Canvas API pixel sampling of skin + hair
- 🌈 **6 colour seasons supported** — Deep Autumn, True Autumn, Warm Spring, Deep Winter, True Winter, Light Summer
- 🌤️ **Live weather integration** — Open-Meteo API (free, no key)
- 📍 **Geolocation support** — tap "Use my location" for instant weather
- 💾 **Export reports** — save your analysis as .txt
- 🔒 **100% private** — photos never leave your browser
- 📱 **Mobile-first responsive** — works on any device
- ⚡ **No backend** — pure HTML/CSS/JavaScript, deploys anywhere
- 🆓 **No account needed** — just open and use

## 📊 Specs

- **Lines of code:** ~1,100
- **File size:** ~70 KB total (index.html + app.js)
- **Dependencies:** zero
- **APIs used:** Open-Meteo (weather + geocoding), browser Geolocation
- **Browsers:** Chrome, Safari, Firefox, Edge (modern)
- **Mobile:** iOS Safari + Android Chrome tested

## 🛠️ Tech Stack

- Vanilla HTML / CSS / JavaScript
- Canvas 2D API for pixel-level colour sampling
- Open-Meteo API for weather data
- Browser Geolocation API
- SVG for frame shapes and avatar illustrations

## 📁 Project Structure

```
colorcompass/
├── index.html          # Main app page with avatar guide
├── app.js              # Analysis logic + palette library + rendering
└── README.md           # This file
```

## 🧠 How The Analysis Works

1. User uploads a selfie
2. Image loaded onto a hidden `<canvas>`
3. Pixel regions sampled from face centre (skin) and top edge (hair)
4. Average RGB computed → warmth / depth / contrast scored:
   - **Warmth** = (R + G) / 2 − B → warm vs cool
   - **Depth** = (R + G + B) / 3 → light vs deep
   - **Contrast** = |skin brightness − hair brightness|
5. Seasonal theory logic maps scores to one of 6 seasons
6. Season-specific palette, outfits, and brand recommendations rendered

## 👩 How to Use

1. Follow the on-screen avatar guide (natural light, face centered, bare face, no filters)
2. Upload your selfie or take one on mobile
3. Tap **Analyse Me ✦**
4. Explore 12 tabs of personalised recommendations
5. Enter your city for weather-based outfit suggestions
6. Save your report as .txt if you want to keep it

## 👩‍💻 Author

**Madhumitha Challa** — Final-year Master of Information Technology, Monash University

- 🌐 Portfolio: https://madhumithachalla.github.io/
- 💼 LinkedIn: linkedin.com/in/madhumithachalla
- 🐙 GitHub: https://github.com/madhumithachalla

## 📜 License

MIT License — feel free to fork, modify, and use.

## 🚢 Deployment

Pure static site — works on any host:

```bash
# GitHub Pages (recommended)
# Push to repo and enable Pages in Settings → Pages → main / root

# Local test
python3 -m http.server 8000
# Open http://localhost:8000
```

See `DEPLOY.md` for full PowerShell / Bash commands.

## 🙏 Credits

- Weather data: [Open-Meteo](https://open-meteo.com/)
- Colour theory: based on classic seasonal analysis (Johannes Itten / 12-season system)
- Built in 2026 as a portfolio project

---

*ColorCompass — your pocket colour analyst.* ✨
