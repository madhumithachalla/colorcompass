// ColorCompass - AI Personal Style Analysis
// (c) 2026 Madhumitha Challa - MIT License
// 100% client-side. No backend. No tracking.

let currentImage = null;
let currentAnalysis = null;

document.getElementById('file').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = ev => {
    currentImage = ev.target.result;
    document.getElementById('drop').classList.add('has-image');
    document.getElementById('dropContent').innerHTML = '<img src="' + currentImage + '">';
    document.getElementById('analyzeBtn').disabled = false;
  };
  r.onerror = () => {
    document.getElementById('dropContent').innerHTML = '<p style="color:#c41e3a; font-size:13px;">Couldn\'t read that file — try a different photo.</p>';
  };
  r.readAsDataURL(f);
});

// Live in-page camera, via getUserMedia, as an alternative to the native
// file-input camera picker. The <input capture> approach above works in
// real mobile browsers (Chrome, Safari) but many in-app browsers (opened
// from a chat app, social app, etc.) ignore the capture attribute entirely
// and only show a gallery picker - this gives those users a working camera
// option too, wherever getUserMedia itself is permitted.
let cameraStream = null;

async function startCamera() {
  const note = document.getElementById('cameraFallbackNote');
  note.style.display = 'none';
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    document.getElementById('cameraVideo').srcObject = cameraStream;
    document.getElementById('cameraLive').style.display = 'block';
    document.getElementById('drop').style.display = 'none';
  } catch (e) {
    note.style.display = 'block';
  }
}

function stopCamera() {
  if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
  document.getElementById('cameraLive').style.display = 'none';
  document.getElementById('drop').style.display = 'block';
}

function snapPhoto() {
  const video = document.getElementById('cameraVideo');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  currentImage = canvas.toDataURL('image/jpeg', 0.92);
  stopCamera();
  document.getElementById('drop').classList.add('has-image');
  document.getElementById('dropContent').innerHTML = '<img src="' + currentImage + '">';
  document.getElementById('analyzeBtn').disabled = false;
}

function showAnalysisError(message) {
  const results = document.getElementById('results');
  results.innerHTML = `<div class="sec vis analyzing"><p style="color:#c41e3a; font-weight:700;">⚠️ ${message}</p><p style="font-size:12px; color:#666; margin-top:8px;">Try a plain JPEG or PNG photo (not HEIC/Live Photo), or a different image.</p></div>`;
}

async function analyze() {
  const results = document.getElementById('results');
  results.classList.remove('hidden');
  results.innerHTML = '<div class="sec vis analyzing"><div class="spin"></div><p>Analysing your coloring, features & undertone...</p></div>';
  results.scrollIntoView({ behavior: 'smooth' });

  const img = new Image();
  const timeout = setTimeout(() => {
    showAnalysisError("This is taking too long — your browser may not be able to decode this photo's format.");
  }, 8000);

  img.onload = () => {
    clearTimeout(timeout);
    try {
      const canvas = document.createElement('canvas');
      const scale = Math.min(400 / img.width, 400 / img.height, 1);
      canvas.width = img.width * scale; canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const skin = sampleRegion(ctx, canvas.width * 0.4, canvas.height * 0.5, canvas.width * 0.2, canvas.height * 0.15);
      const hair = sampleRegion(ctx, canvas.width * 0.3, canvas.height * 0.08, canvas.width * 0.4, canvas.height * 0.12);
      currentAnalysis = diagnose(skin, hair);
      renderResults(currentAnalysis);
    } catch (e) {
      showAnalysisError("Something went wrong reading that photo (" + e.message + ").");
    }
  };
  img.onerror = () => {
    clearTimeout(timeout);
    showAnalysisError("Your browser couldn't open this photo — it may be in a format (like HEIC) it doesn't support.");
  };
  img.src = currentImage;
}

function sampleRegion(ctx, x, y, w, h) {
  const pixels = ctx.getImageData(x, y, w, h).data;
  let r=0, g=0, b=0, count=0;
  for (let i=0; i<pixels.length; i+=4) { r+=pixels[i]; g+=pixels[i+1]; b+=pixels[i+2]; count++; }
  return { r: r/count, g: g/count, b: b/count };
}

// RGB -> HSL: the actual colour-wheel coordinates (hue = angle around the
// wheel, saturation = distance from the centre/grey axis = "clarity",
// lightness = the light<->deep axis). Everything below is computed from
// these three real values, not arbitrary RGB arithmetic.
function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  switch (max) {
    case r: h = (g - b) / d + (g < b ? 6 : 0); break;
    case g: h = (b - r) / d + 2; break;
    default: h = (r - g) / d + 4;
  }
  return { h: h * 60, s, l };
}

// Real human skin hue (regardless of undertone) always falls in a narrow
// reddish-orange-yellow band - roughly hue 340°-360° through 0°-60° - never
// spread across the full 360° wheel the way a generic "warm half vs cool
// half" split (centred on orange vs centred on blue) assumes. So the usual
// "which 180° hemisphere" rule is wrong here: every real skin tone would
// land on the "warm" side of that generic split, warm and cool undertones
// included, which defeats the point. What actually separates a warm from a
// cool undertone is a much narrower distinction *within* that band: more
// toward orange/yellow (higher hue, within the band) reads warm; more
// toward red/pink (lower hue, or wrapped-around toward magenta) reads cool.
// SKIN_HUE_THRESHOLD is that boundary, calibrated to sit roughly where
// "gold/peach" shifts into "rose/pink" on a real face.
const SKIN_HUE_THRESHOLD = 25;
function skinHueOffset(h) { return h > 200 ? h - 360 : h; } // unwraps reds/pinks near 360° to negative, so the whole realistic skin-hue band sits on one continuous line
function isWarmSkinTone(h) { return skinHueOffset(h) > SKIN_HUE_THRESHOLD; }

function diagnose(skin, hair) {
  const sHsl = rgbToHsl(skin), hHsl = rgbToHsl(hair);
  const warm = isWarmSkinTone(sHsl.h);
  const lightContrast = Math.abs(sHsl.l - hHsl.l);
  const depthBucket = sHsl.l >= 0.62 ? 'Light' : sHsl.l < 0.45 ? 'Deep' : 'Medium';
  const contrastBucket = lightContrast > 0.22 ? 'High' : lightContrast < 0.10 ? 'Low' : 'Medium';
  const clarityBucket = sHsl.s >= 0.45 ? 'Clear' : sHsl.s < 0.28 ? 'Soft' : 'True';
  const isDeepFamily = depthBucket !== 'Light';

  let season, sub;
  if (warm && !isDeepFamily) {
    // Spring family: warm + light
    if (clarityBucket === 'Clear') { season = 'Clear Spring'; sub = 'Warm · Clear · Bright'; }
    else if (clarityBucket === 'Soft') { season = 'Light Spring'; sub = 'Warm · Soft · Light'; }
    else { season = 'Warm Spring'; sub = 'Warm · True · Medium Contrast'; }
  } else if (warm && isDeepFamily) {
    // Autumn family: warm + medium/deep
    if (clarityBucket === 'Soft') { season = 'Soft Autumn'; sub = 'Warm · Muted · Soft'; }
    else if (depthBucket === 'Deep' && contrastBucket === 'High') { season = 'Deep Autumn'; sub = 'Warm · Muted-Rich · High Contrast'; }
    else { season = 'True Autumn'; sub = 'Warm · Muted · Medium Contrast'; }
  } else if (!warm && !isDeepFamily) {
    // Summer family: cool + light
    if (clarityBucket === 'Soft') { season = 'Soft Summer'; sub = 'Cool · Muted · Soft'; }
    else if (contrastBucket !== 'Low') { season = 'Cool Summer'; sub = 'Cool · True · Medium Contrast'; }
    else { season = 'Light Summer'; sub = 'Cool · Muted · Low Contrast'; }
  } else {
    // Winter family: cool + medium/deep
    if (clarityBucket === 'Clear') { season = 'Clear Winter'; sub = 'Cool · Clear · High Contrast'; }
    else if (depthBucket === 'Deep' && contrastBucket === 'High') { season = 'Deep Winter'; sub = 'Cool · Clear · High Contrast'; }
    else { season = 'True Winter'; sub = 'Cool · True · High Contrast'; }
  }

  return {
    season, sub,
    undertone: warm ? 'Warm Golden' : 'Cool',
    contrast: contrastBucket,
    clarity: clarityBucket,
    depth: depthBucket,
    warm,
    skinHue: sHsl.h,
    palette: paletteFor(season)
  };
}

// Shows the full 12-hue wheel for orientation, plus two things that are
// specific and real: a dashed line at the actual warm/cool skin-tone
// threshold this tool uses (not the generic half-wheel split - see
// isWarmSkinTone above for why), and a marker pin at your photo's actual
// measured skin hue angle, so this is a real plotted point, not a vague
// "your half is highlighted" illustration.
function colorWheelSVG(warm, skinHue) {
  const cx = 70, cy = 70, rOuter = 62, rInner = 30, rMarker = 46;
  const toRad = d => (d - 90) * Math.PI / 180;
  const point = (r, deg) => [cx + r * Math.cos(toRad(deg)), cy + r * Math.sin(toRad(deg))];
  let wedges = '';
  for (let h = 0; h < 360; h += 30) {
    const [x1, y1] = point(rOuter, h), [x2, y2] = point(rOuter, h + 30);
    const [x3, y3] = point(rInner, h + 30), [x4, y4] = point(rInner, h);
    const path = `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 0 0 ${x4} ${y4} Z`;
    wedges += `<path d="${path}" fill="hsl(${h},70%,55%)" stroke="#fff" stroke-width="1.5"/>`;
  }
  // the real warm/cool boundary line (SKIN_HUE_THRESHOLD and its mirror)
  const [bx1, by1] = point(rOuter + 4, SKIN_HUE_THRESHOLD);
  const [bx2, by2] = point(rOuter + 4, SKIN_HUE_THRESHOLD + 180);
  const boundaryLine = `<line x1="${bx1}" y1="${by1}" x2="${bx2}" y2="${by2}" stroke="#333" stroke-width="1.5" stroke-dasharray="3,2"/>`;
  // the marker pin at the actual measured hue
  const [mx, my] = point(rMarker, skinHue);
  const marker = `<circle cx="${mx}" cy="${my}" r="6" fill="#fff" stroke="#1B1130" stroke-width="2.5"/>`;
  const label = warm ? 'WARM' : 'COOL';
  return `<svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="Colour wheel with your measured hue (${Math.round(skinHue)} degrees) marked, ${label.toLowerCase()} side">
    ${wedges}
    ${boundaryLine}
    ${marker}
    <circle cx="${cx}" cy="${cy}" r="${rInner - 2}" fill="#fff"/>
    <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="12" font-weight="800" fill="#333">${label}</text>
  </svg>`;
}

function seasonExplainer(a) {
  const warmText = a.warm
    ? `your skin's actual measured hue (${Math.round(a.skinHue)}° on the wheel, marked above) sits on the golden-orange-yellow side of where skin tones split warm from cool, rather than the rosier red-pink side`
    : `your skin's actual measured hue (${Math.round(a.skinHue)}° on the wheel, marked above) sits on the rosier red-pink side of where skin tones split warm from cool, rather than the golden-orange-yellow side`;
  const contrastText = {
    High: 'your skin and hair are far apart in brightness, so bold, clear colours and strong combinations (like a deep neutral with a bright accent) read as flattering rather than harsh',
    Medium: 'your skin and hair sit a medium distance apart in brightness, so moderately rich, blended colours work better than either pastels or stark high-contrast pairings',
    Low: 'your skin and hair are close together in brightness, so soft, blended, low-contrast colour combinations flatter you more than anything stark or high-contrast'
  }[a.contrast];
  const depthText = {
    Deep: 'your overall colouring reads as deep rather than light, so rich, saturated shades hold their own against your natural depth instead of washing out',
    Medium: 'your overall colouring sits in the mid-range between light and deep, giving you flexibility toward both richer and lighter shades within your warm/cool family',
    Light: 'your overall colouring reads as light rather than deep, so softer, lighter shades stay in proportion instead of overwhelming your natural colouring'
  }[a.depth];
  const clarityText = {
    Clear: 'your colouring has high saturation — distance from grey on the wheel — so bright, clean, high-impact colours look vivid on you rather than costume-y',
    Soft: 'your colouring has low saturation — closer to the grey centre of the wheel — so muted, dusty, blended colours look rich on you where bright primaries would look like they\'re wearing you',
    True: 'your colouring sits at a moderate saturation, neither especially muted nor especially vivid, which is what pulls your palette toward balanced, true mid-tone colours rather than either extreme'
  }[a.clarity];
  return `You're a <strong>${a.season}</strong> (${a.sub}). In plain terms: ${warmText}; ${contrastText}; ${depthText}; and ${clarityText}. Every colour below is chosen for sitting on your side of the wheel at a hue, depth and saturation that match how you actually look — that's the whole idea behind seasonal colour theory: find the colours whose warmth, depth and clarity echo your own, rather than picking "nice colours" at random. A colour that's technically pretty can still fight your natural colouring if it's the wrong temperature, depth or saturation for you; a colour that looks plain on its own can look great once it's matched to your wheel position.`;
}

// Celebrities commonly cited for each season in seasonal-colour-analysis
// communities. This is pop-culture consensus, not a verified classification
// - different colour analysts place the same person in different seasons,
// and public figures change their hair/makeup, so treat these as "a famous
// face with roughly this colouring" rather than a fact about that person.
const SEASON_CELEBRITIES = {
  'Deep Autumn': ['Julia Roberts', 'Jennifer Lopez'],
  'Warm Spring': ['Blake Lively', 'Nicole Kidman'],
  'Deep Winter': ['Anne Hathaway', 'Lucy Liu'],
  'Light Summer': ['Reese Witherspoon', 'Cameron Diaz'],
  'True Autumn': ['Jessica Chastain', 'Julianne Moore'],
  'True Winter': ['Megan Fox', 'Liv Tyler'],
  'Light Spring': ['Margot Robbie', 'Emma Stone'],
  'Clear Spring': ['Zendaya', 'Priyanka Chopra'],
  'Soft Autumn': ['Jennifer Aniston', 'Drew Barrymore'],
  'Clear Winter': ['Kim Kardashian', 'Dita Von Teese'],
  'Cool Summer': ['Charlize Theron', 'Emily Blunt'],
  'Soft Summer': ['Kate Middleton', 'Jennifer Garner']
};

const ACCURACY_NOTE = "How accurate is this: this tool converts the average pixel colour of two small regions of your photo (skin, hair) into real HSL colour-wheel coordinates — hue (your position around the wheel, which decides warm vs cool), saturation (distance from the wheel's grey centre, which decides clear vs soft) and lightness (which decides light vs deep) — then classifies you into one of the 12 standard seasonal-colour-theory categories from those three measured values. It's a genuine, real measurement of your actual photo on the actual colour wheel, not a random guess or a coin-flip heuristic. That said, it's still a simple two-region sample, not professional colour draping under controlled studio lighting. Your photo's white balance, lighting colour and camera processing all shift the measured hue/saturation/lightness, which is why the tips above (natural daylight, no filters, neutral top) matter: they're what makes the three measurements trustworthy in the first place. Treat the season below as a well-reasoned, wheel-grounded starting point to experiment from, not a lab-verified diagnosis.";

function paletteFor(season) {
  const P = {
    'Deep Autumn': {
      best: [['#8B1A1A','Burgundy'],['#5C3317','Chocolate'],['#704214','Cognac'],['#556B2F','Olive'],['#2C4A3E','Forest Teal'],['#C17B3A','Burnt Sienna'],['#800020','Crimson'],['#B8860B','Dark Gold'],['#4A235A','Deep Plum'],['#B87333','Rust Copper']],
      neutrals: [['#3B2314','Espresso'],['#1C1C1C','Off-Black'],['#7D6544','Warm Taupe'],['#C4A882','Warm Sand'],['#F5ECD7','Cream']],
      accents: [['#B8860B','Dark Gold'],['#C17B3A','Burnt Sienna'],['#800020','Crimson'],['#4A235A','Deep Plum']],
      avoid: [['#ADD8E6','Baby Blue'],['#FFB6C1','Cool Pink'],['#E0E0E0','Cool Grey'],['#DDA0DD','Cool Lilac'],['#F0F8FF','Icy White'],['#7FFFD4','Mint']],
      metals: 'Gold · Copper · Bronze (never silver)',
      metalPrimary: 'Gold',
      foundation: {
        undertone: 'Warm golden-olive. Shades marked W, Y, N — never C or P.',
        fenty: '460W, 480W, 490W',
        mac: 'NC50, NC55, NW45',
        loreal: 'W8 Golden Cappuccino, W9 Chestnut',
        tip: 'Match your neck not your face. Avoid SPF for flashback.'
      },
      blush: [['#C1440E','Warm Brick'],['#A0522D','Terracotta'],['#8B3A3A','Deep Rose'],['#C67C52','Peach Copper']],
      bronzer: [['#7B4F2E','Deep Bronze'],['#6B3A2A','Mahogany'],['#9C6B3C','Warm Toffee']],
      highlighter: [['#C8902A','Deep Gold'],['#B87333','Copper'],['#D4A853','Bronze Gold']],
      eyeEveryday: [['#C4A265','Champagne'],['#8B6914','Bronze'],['#6B4226','Cocoa'],['#3B2314','Espresso']],
      eyeDrama: [['#1C1C1C','Matte Black'],['#4A235A','Deep Plum'],['#2C4A3E','Forest Green'],['#B87333','Copper Foil'],['#8B1A1A','Oxblood']],
      eyeliner: [['#0A0A0A','Jet Black'],['#2C1810','Dark Brown'],['#4A235A','Deep Plum'],['#556B2F','Forest Green']],
      lipEveryday: [['#7B3F3F','Warm Berry'],['#A0522D','Warm Brown'],['#C17B3A','Sienna']],
      lipBold: [['#800020','Crimson'],['#5C1A1A','Oxblood'],['#4A235A','Dark Plum']],
      lipNude: [['#A0786A','Warm Nude'],['#8B5E52','Mocha'],['#7A5C50','Deep Mauve']],
      lipProducts: 'MAC Chestnut liner, Charlotte Tilbury Walk of Shame, NARS Casablanca, Fenty Icon She\'s a Star',
      face: 'Features vary — this app diagnoses colour, not shape. For face shape insights, visit a stylist.',
      hair: 'Blue-black (your natural is best), espresso, dark mocha, warm chestnut. Balayage in caramel or copper. AVOID platinum, ash grey, silver.',
      hairDirection: 'Stay dark, stay warm. Your natural blue-black is genuinely your best colour.',
      cuts: 'Long layers, lob with movement, curtain bangs (yes!), wolf cut for texture',
      bangs: 'Curtain bangs YES (softens high forehead). Blunt fringe NO.',
      lengths: 'Collarbone to mid-back is your sweet spot',
      stylingTips: 'Enhance natural wave with curl cream + diffuser. Side part opens the face.',
      glasses: {
        best: 'Round tortoise (★ top pick), rectangle in warm acetate (office), cat-eye in deep brown (evening), gold wire aviators (casual)',
        colors: [['#5C3317','Tortoise'],['#704214','Cognac'],['#B8860B','Gold'],['#B87333','Rose Gold'],['#8B1A1A','Burgundy'],['#3B2314','Warm Black']],
        avoid: [['#C0C0C0','Cool Silver'],['#000000','Thick Jet Black'],['#FFB6C1','Pastel'],['#F5F5F5','Rimless']],
        sunglasses: 'Oversized tortoise, Jackie-O oval, warm-brown aviators, burgundy cat-eye. Warm brown/amber/bronze lens tints.',
        brands: 'Ray-Ban Jackie Ohh, Oliver Peoples Finley, Prada PR 17WS Baroque, Karen Walker Super Duper'
      }
    },
    'True Autumn': {
      best: [['#D2691E','Chocolate Orange'],['#808000','Olive'],['#8B4513','Saddle Brown'],['#B87333','Copper'],['#556B2F','Dark Olive'],['#A0522D','Sienna'],['#DAA520','Goldenrod'],['#8B6914','Dark Mustard']],
      neutrals: [['#4A3C28','Dark Taupe'],['#6B5842','Warm Brown'],['#C19A6B','Camel'],['#F5DEB3','Wheat'],['#2F2F2F','Soft Black']],
      accents: [['#DAA520','Goldenrod'],['#B87333','Copper'],['#8B4513','Saddle']],
      avoid: [['#FF69B4','Hot Pink'],['#00FFFF','Cyan'],['#FFFFFF','Pure White'],['#000080','Navy']],
      metals: 'Gold · Copper · Bronze', metalPrimary: 'Gold',
      foundation: { undertone: 'Warm, golden-peach', fenty: '420-460', mac: 'NC45-50', loreal: 'W7-8', tip: 'Yellow-based always wins.' },
      blush: [['#CD853F','Peru'],['#B87333','Copper'],['#A0522D','Sienna']],
      bronzer: [['#8B5A2B','Golden Bronze'],['#A0522D','Warm Brick']],
      highlighter: [['#DAA520','Golden'],['#B87333','Copper']],
      eyeEveryday: [['#DEB887','Burlywood'],['#8B6914','Mustard'],['#6B4226','Cocoa']],
      eyeDrama: [['#2F4F4F','Dark Teal'],['#8B4513','Saddle'],['#8B6914','Rich Bronze']],
      eyeliner: [['#2C1810','Brown'],['#556B2F','Olive'],['#8B4513','Rust']],
      lipEveryday: [['#CD853F','Peru'],['#A0522D','Sienna']],
      lipBold: [['#B22222','Firebrick'],['#8B4513','Deep Rust']],
      lipNude: [['#C19A6B','Camel'],['#A0786A','Warm Nude']],
      lipProducts: 'NARS Dolce Vita, MAC Taupe, Charlotte Tilbury Pillow Talk Medium',
      face: 'Features vary — this app diagnoses colour, not shape.',
      hair: 'Warm brown, auburn, chestnut, honey balayage.',
      hairDirection: 'Warm honey tones, auburn highlights.',
      cuts: 'Soft layers, lob, side-swept bangs',
      bangs: 'Side-swept or wispy YES',
      lengths: 'Shoulder to mid-back',
      stylingTips: 'Soft waves, warm shine serum',
      glasses: {
        best: 'Tortoise, honey acetate, gold wire',
        colors: [['#8B4513','Honey Tortoise'],['#DAA520','Gold'],['#CD853F','Caramel']],
        avoid: [['#C0C0C0','Silver'],['#000000','Jet Black']],
        sunglasses: 'Warm tortoise, honey, gold rims',
        brands: 'Ray-Ban Clubmaster, Oliver Peoples Gregory Peck'
      }
    },
    'Warm Spring': {
      best: [['#FF7F50','Coral'],['#FFD700','Golden Yellow'],['#98FB98','Fresh Green'],['#F4A460','Peach'],['#FF6347','Tomato'],['#DAA520','Gold'],['#20B2AA','Turquoise'],['#FFA07A','Salmon']],
      neutrals: [['#F5DEB3','Wheat'],['#DEB887','Burlywood'],['#8B7355','Warm Taupe'],['#FFF8DC','Ivory']],
      accents: [['#FFD700','Gold'],['#FF7F50','Coral']],
      avoid: [['#000000','Black'],['#808080','Grey'],['#4B0082','Indigo'],['#800080','Purple']],
      metals: 'Gold · Rose gold (bright, polished)', metalPrimary: 'Gold',
      foundation: { undertone: 'Warm, peach-yellow', fenty: '220-280', mac: 'NC25-35', loreal: 'W4-6', tip: 'Light-medium warm shades.' },
      blush: [['#FF7F50','Coral'],['#FFA07A','Salmon']],
      bronzer: [['#CD853F','Golden'],['#D2B48C','Tan']],
      highlighter: [['#FFD700','Gold'],['#FFEBCD','Peach']],
      eyeEveryday: [['#F4A460','Peach'],['#CD853F','Caramel']],
      eyeDrama: [['#20B2AA','Teal'],['#DAA520','Gold']],
      eyeliner: [['#8B4513','Brown'],['#2F4F4F','Teal']],
      lipEveryday: [['#FF7F50','Coral'],['#FFA07A','Peach']],
      lipBold: [['#FF4500','Coral Red'],['#FF6347','Tomato']],
      lipNude: [['#FFDAB9','Peach Nude']],
      lipProducts: 'NARS Niagara, MAC Vegas Volt, Fenty Freckle Fiesta',
      face: 'Features vary.',
      hair: 'Honey blonde, caramel, golden brown.',
      hairDirection: 'Warm honey, caramel, light golden tones.',
      cuts: 'Soft layers, lob, beach waves',
      bangs: 'Wispy or curtain',
      lengths: 'Shoulder to long',
      stylingTips: 'Beachy waves, loose',
      glasses: {
        best: 'Honey tortoise, gold wire, warm clear acetate',
        colors: [['#CD853F','Honey'],['#DAA520','Gold']],
        avoid: [['#000000','Black'],['#C0C0C0','Silver']],
        sunglasses: 'Peach-tinted, warm tortoise',
        brands: 'Ray-Ban Wayfarer honey, Chloé'
      }
    },
    'Deep Winter': {
      best: [['#000080','Royal Blue'],['#8B0000','Dark Red'],['#4B0082','Indigo'],['#008000','Emerald'],['#DC143C','Crimson'],['#191970','Midnight'],['#C71585','Magenta'],['#2F4F4F','Charcoal Teal']],
      neutrals: [['#000000','True Black'],['#FFFFFF','Pure White'],['#2F2F2F','Charcoal'],['#C0C0C0','Silver Grey']],
      accents: [['#DC143C','Crimson'],['#C71585','Magenta']],
      avoid: [['#F4A460','Peach'],['#FFD700','Gold'],['#808000','Olive'],['#DEB887','Beige']],
      metals: 'Silver · Platinum · White gold', metalPrimary: 'Silver',
      foundation: { undertone: 'Cool, blue-based', fenty: '440-490 (C series)', mac: 'NW40-50', loreal: 'C7-9', tip: 'Blue undertone, avoid yellow bases.' },
      blush: [['#B22222','True Red'],['#C71585','Berry']],
      bronzer: [['#654321','Cool Deep Brown']],
      highlighter: [['#E8E8E8','Icy White'],['#B0C4DE','Pearl']],
      eyeEveryday: [['#696969','Cool Grey'],['#2F4F4F','Slate']],
      eyeDrama: [['#4B0082','Indigo'],['#000000','Jet Black']],
      eyeliner: [['#000000','Black'],['#4B0082','Deep Plum']],
      lipEveryday: [['#8B0000','Berry Red'],['#C71585','Berry']],
      lipBold: [['#DC143C','Crimson'],['#8B008B','Fuchsia']],
      lipNude: [['#C08081','Cool Mauve']],
      lipProducts: 'MAC Ruby Woo, NARS Dragon Girl, Charlotte Tilbury Red Carpet Red',
      face: 'Features vary.',
      hair: 'Jet black, dark cool brown, cool chestnut.',
      hairDirection: 'Cool deep tones only, no warm highlights.',
      cuts: 'Sharp blunt cuts, bob, long layers',
      bangs: 'Blunt or micro',
      lengths: 'Any — holds structure',
      stylingTips: 'Sleek and polished',
      glasses: {
        best: 'Black acetate, silver wire, deep tortoise',
        colors: [['#000000','Jet Black'],['#C0C0C0','Silver']],
        avoid: [['#DAA520','Gold'],['#DEB887','Beige']],
        sunglasses: 'Black acetate, silver aviator',
        brands: 'Ray-Ban Wayfarer black, Prada'
      }
    },
    'True Winter': {
      best: [['#FF0000','True Red'],['#000080','Navy'],['#FF1493','Hot Pink'],['#008080','Teal'],['#8B008B','Magenta'],['#000000','Jet Black']],
      neutrals: [['#000000','Black'],['#FFFFFF','White'],['#696969','Grey']],
      accents: [['#FF0000','Red'],['#FF1493','Pink']],
      avoid: [['#F5DEB3','Beige'],['#8B4513','Brown'],['#DAA520','Mustard']],
      metals: 'Silver · Platinum', metalPrimary: 'Silver',
      foundation: { undertone: 'Cool, pink-based', fenty: 'C-series', mac: 'NW shades', loreal: 'C-series', tip: 'Cool pink base.' },
      blush: [['#FF1493','Hot Pink'],['#C71585','Berry']],
      bronzer: [['#8B4513','Cool Taupe']],
      highlighter: [['#F0F8FF','Icy']],
      eyeEveryday: [['#C0C0C0','Silver'],['#808080','Grey']],
      eyeDrama: [['#000080','Navy'],['#000000','Black']],
      eyeliner: [['#000000','Black']],
      lipEveryday: [['#FF0000','True Red']],
      lipBold: [['#FF1493','Fuchsia']],
      lipNude: [['#F8BBD0','Cool Pink Nude']],
      lipProducts: 'MAC Russian Red, NARS Schiap',
      face: 'Features vary.',
      hair: 'Jet black, platinum, ash cool tones.',
      hairDirection: 'Cool extremes only.',
      cuts: 'Sharp precision cuts',
      bangs: 'Blunt or none',
      lengths: 'Short to medium',
      stylingTips: 'Mirror-shine finish',
      glasses: { best: 'Black, silver, clear', colors: [['#000000','Black'],['#C0C0C0','Silver']], avoid: [['#DAA520','Gold']], sunglasses: 'Black lens, silver frames', brands: 'Ray-Ban, Celine' }
    },
    'Light Summer': {
      best: [['#B0C4DE','Powder Blue'],['#FFB6C1','Light Pink'],['#E6E6FA','Lavender'],['#AFEEEE','Pale Turquoise']],
      neutrals: [['#F5F5F5','Soft White'],['#D3D3D3','Light Grey'],['#F0F8FF','Ice']],
      accents: [['#B0C4DE','Blue'],['#E6E6FA','Lavender']],
      avoid: [['#8B4513','Brown'],['#000000','Black'],['#FF4500','Orange']],
      metals: 'Silver · Rose gold', metalPrimary: 'Silver',
      foundation: { undertone: 'Cool, light pink', fenty: '110-170', mac: 'NW15-25', loreal: 'C2-4', tip: 'Delicate pink-cool base.' },
      blush: [['#FFB6C1','Soft Pink']],
      bronzer: [['#D2B48C','Light Cool Tan']],
      highlighter: [['#FFF0F5','Rose Pearl']],
      eyeEveryday: [['#D3D3D3','Soft Grey'],['#E6E6FA','Lavender']],
      eyeDrama: [['#B0C4DE','Dusty Blue']],
      eyeliner: [['#696969','Soft Grey']],
      lipEveryday: [['#FFB6C1','Soft Pink']],
      lipBold: [['#FF69B4','Cool Rose']],
      lipNude: [['#F8BBD0','Pink Nude']],
      lipProducts: 'NARS Dolce Vita, MAC Faux',
      face: 'Features vary.',
      hair: 'Light cool blonde, ash blonde.',
      hairDirection: 'Keep soft and cool.',
      cuts: 'Soft layers, waves',
      bangs: 'Wispy soft',
      lengths: 'Shoulder',
      stylingTips: 'Soft diffused',
      glasses: { best: 'Light tortoise, rose gold, silver wire', colors: [['#B87333','Rose Gold'],['#C0C0C0','Silver']], avoid: [['#000000','Black']], sunglasses: 'Light tortoise, pink-tinted', brands: 'Warby Parker, Chloé' }
    }
,
    "Light Spring": {
      best: [['#f5b197','Coral'],['#eed54f','Golden Yellow'],['#d7f9d7','Fresh Green'],['#eec6a3','Peach'],['#f49f8f','Tomato'],['#d4b464','Gold'],['#4ac5be','Turquoise'],['#f9cebe','Salmon']],
      neutrals: [['#faf5eb','Wheat'],['#e3d3bf','Burlywood'],['#958f88','Warm Taupe'],['#ffffff','Ivory']],
      accents: [['#eed54f','Gold'],['#f5b197','Coral']],
      avoid: [['#1f1f1f','Black'],['#9f9f9f','Grey'],['#6c11ae','Indigo'],['#ac11ac','Purple']],
      metals: 'Light gold · Soft rose gold (never heavy)', metalPrimary: 'Gold',
      foundation: { undertone: 'Warm, light peachy-ivory', fenty: '150-210', mac: 'NC15-25', loreal: 'W2-4', tip: 'Lightest warm shades — avoid anything deep or ashy.' },
      blush: [['#f5b197','Coral'],['#f9cebe','Salmon']],
      bronzer: [['#c9a480','Golden'],['#dacfc1','Tan']],
      highlighter: [['#eed54f','Gold'],['#ffffff','Peach']],
      eyeEveryday: [['#eec6a3','Peach'],['#c9a480','Caramel']],
      eyeDrama: [['#4ac5be','Teal'],['#d4b464','Gold']],
      eyeliner: [['#ad632e','Brown'],['#576565','Teal']],
      lipEveryday: [['#f5b197','Coral'],['#f9cebe','Peach']],
      lipBold: [['#ee7a4f','Coral Red'],['#f49f8f','Tomato']],
      lipNude: [['#fefaf7','Peach Nude']],
      lipProducts: 'Fenty Fairy Bomb, NARS Orgasm, MAC Peach Blossom',
      face: 'Features vary.',
      hair: 'Light golden blonde, strawberry blonde, soft honey.',
      hairDirection: 'Keep it light and warm — avoid ash or jet-dark tones.',
      cuts: 'Soft layers, wispy lob, face-framing pieces',
      bangs: 'Wispy, soft-textured YES',
      lengths: 'Chin to shoulder suits you best',
      stylingTips: 'Soft beachy waves, light-catching shine',
      glasses: { best: 'Light honey tortoise, soft gold wire, warm clear acetate', colors: [['#c9a480','Honey'],['#d4b464','Gold']], avoid: [['#1f1f1f','Black'],['#dfdfdf','Silver']], sunglasses: 'Pastel-tinted, light tortoise', brands: 'Warby Parker Reeve, Ray-Ban Erika light tortoise' }
    },
    "Clear Spring": {
      best: [['#ff8a5f','Coral'],['#ffd90f','Golden Yellow'],['#a3ffa3','Fresh Green'],['#ffab64','Peach'],['#ff7056','Tomato'],['#f6b514','Gold'],['#0ed3c8','Turquoise'],['#ffab89','Salmon']],
      neutrals: [['#fde6ba','Wheat'],['#eec187','Burlywood'],['#aa7d45','Warm Taupe'],['#fffbeb','Ivory']],
      accents: [['#ffd90f','Gold'],['#ff8a5f','Coral']],
      avoid: [['#090606','Black'],['#9d7272','Grey'],['#540091','Indigo'],['#8f008f','Purple']],
      metals: 'Bright gold · Clear rose gold', metalPrimary: 'Gold',
      foundation: { undertone: 'Warm-neutral, bright', fenty: '190-250', mac: 'NC30-37', loreal: 'W5-6', tip: 'Clear, not muddy — avoid overly yellow or ashy shades.' },
      blush: [['#ff8a5f','Coral'],['#ffab89','Salmon']],
      bronzer: [['#e58c37','Golden'],['#e3bd8a','Tan']],
      highlighter: [['#ffd90f','Gold'],['#fff1dc','Peach']],
      eyeEveryday: [['#ffab64','Peach'],['#e58c37','Caramel']],
      eyeDrama: [['#0ed3c8','Teal'],['#f6b514','Gold']],
      eyeliner: [['#a84905','Brown'],['#286565','Teal']],
      lipEveryday: [['#ff8a5f','Coral'],['#ffab89','Peach']],
      lipBold: [['#ff500f','Coral Red'],['#ff7056','Tomato']],
      lipNude: [['#ffe2c8','Peach Nude']],
      lipProducts: 'MAC Lady Danger, NARS Heat Wave, Fenty Unbutton',
      face: 'Features vary.',
      hair: 'Bright golden brown, warm chestnut with clear highlights.',
      hairDirection: 'Bright, clean tones — avoid muted or ashy colour.',
      cuts: 'Sleek lob, blunt bob with movement',
      bangs: 'Blunt, face-framing YES',
      lengths: 'Shoulder to collarbone for maximum shine',
      stylingTips: 'High-shine serum, sleek finish',
      glasses: { best: 'Bright tortoise, gold wire, clear acetate', colors: [['#e58c37','Honey'],['#f6b514','Gold']], avoid: [['#090606','Black'],['#d2bebe','Silver']], sunglasses: 'Mirrored warm tones, bright tortoise', brands: 'Ray-Ban Wayfarer bright tortoise, Gentle Monster' }
    },
    "Soft Autumn": {
      best: [['#c67a44','Chocolate Orange'],['#898911','Olive'],['#8d542a','Saddle Brown'],['#ad8157','Copper'],['#5e694b','Dark Olive'],['#9b654c','Sienna'],['#c7a44c','Goldenrod'],['#8d712c','Dark Mustard']],
      neutrals: [['#4b4740','Dark Taupe'],['#656362','Warm Brown'],['#b4a491','Camel'],['#f1e6d0','Wheat'],['#3c3c3c','Soft Black']],
      accents: [['#c7a44c','Goldenrod'],['#ad8157','Copper'],['#8d542a','Saddle']],
      avoid: [['#f190c1','Hot Pink'],['#33e6e6','Cyan'],['#ffffff','Pure White'],['#111189','Navy']],
      metals: 'Brushed gold · Matte bronze (never shiny)', metalPrimary: 'Gold',
      foundation: { undertone: 'Warm-muted, soft golden', fenty: '370-420', mac: 'NC40-42', loreal: 'W6-7', tip: 'Soft matte finish — shimmer reads harsh on you.' },
      blush: [['#ba926b','Peru'],['#ad8157','Copper'],['#9b654c','Sienna']],
      bronzer: [['#886748','Golden Bronze'],['#9b654c','Warm Brick']],
      highlighter: [['#c7a44c','Golden'],['#ad8157','Copper']],
      eyeEveryday: [['#d5c2a9','Burlywood'],['#8d712c','Mustard'],['#6b513f','Cocoa']],
      eyeDrama: [['#494e4e','Dark Teal'],['#8d542a','Saddle'],['#8d712c','Rich Bronze']],
      eyeliner: [['#352620','Brown'],['#5e694b','Olive'],['#8d542a','Rust']],
      lipEveryday: [['#ba926b','Peru'],['#9b654c','Sienna']],
      lipBold: [['#ad4040','Firebrick'],['#8d542a','Deep Rust']],
      lipNude: [['#b4a491','Camel'],['#929292','Warm Nude']],
      lipProducts: 'MAC Twig, NARS Cruella, Charlotte Tilbury Pillow Talk',
      face: 'Features vary.',
      hair: 'Soft chestnut, muted caramel, dirty blonde.',
      hairDirection: 'Keep tones muted — avoid anything too bright or brassy.',
      cuts: 'Soft layers, shag, textured lob',
      bangs: 'Soft wispy YES',
      lengths: 'Shoulder to mid-length',
      stylingTips: 'Matte texturising spray, loose soft waves',
      glasses: { best: 'Soft matte tortoise, brushed gold, muted olive acetate', colors: [['#8d542a','Honey Tortoise'],['#c7a44c','Gold'],['#ba926b','Caramel']], avoid: [['#cdcdcd','Silver'],['#0d0d0d','Jet Black']], sunglasses: 'Muted tortoise, soft brown gradient', brands: 'Warby Parker Percey, Oliver Peoples' }
    },
    "Clear Winter": {
      best: [['#f00000','True Red'],['#000071','Navy'],['#ff058c','Hot Pink'],['#007171','Teal'],['#7c007c','Magenta'],['#000000','Jet Black']],
      neutrals: [['#000000','Black'],['#f8f6f6','White'],['#705353','Grey']],
      accents: [['#f00000','Red'],['#ff058c','Pink']],
      avoid: [['#fbda9e','Beige'],['#883d06','Brown'],['#dea20c','Mustard']],
      metals: 'Platinum · Bright silver (high shine)', metalPrimary: 'Silver',
      foundation: { undertone: 'Cool, bright pink-blue', fenty: 'C-series bright', mac: 'NC/NW42-46', loreal: 'C8-9', tip: 'Needs a true, bright cool base — avoid any warmth.' },
      blush: [['#ff058c','Hot Pink'],['#c90480','Berry']],
      bronzer: [['#883d06','Cool Taupe']],
      highlighter: [['#e1f1ff','Icy']],
      eyeEveryday: [['#c3aeae','Silver'],['#8a6666','Grey']],
      eyeDrama: [['#000071','Navy'],['#000000','Black']],
      eyeliner: [['#000000','Black']],
      lipEveryday: [['#f00000','True Red']],
      lipBold: [['#ff058c','Fuchsia']],
      lipNude: [['#fda6c4','Cool Pink Nude']],
      lipProducts: 'MAC Ruby Woo, NARS Dragon Girl, YSL Rouge Pur Couture 1',
      face: 'Features vary.',
      hair: 'Jet black, icy platinum, blue-black.',
      hairDirection: 'High contrast, cool extremes — your most dramatic colouring.',
      cuts: 'Sharp geometric cuts, sleek bob',
      bangs: 'Blunt, graphic YES',
      lengths: 'Any — you can carry bold shapes',
      stylingTips: 'Glass-hair finish, sharp precision parting',
      glasses: { best: 'Jet black acetate, bright silver wire, clear crystal', colors: [['#000000','Black'],['#c3aeae','Silver']], avoid: [['#dea20c','Gold']], sunglasses: 'Black mirrored, icy-tinted lenses', brands: 'Celine CL40019, Saint Laurent SL1' }
    },
    "Cool Summer": {
      best: [['#8faed6','Powder Blue'],['#ff8d9e','Light Pink'],['#c2c2f5','Lavender'],['#8aeaea','Pale Turquoise']],
      neutrals: [['#e2dfdf','Soft White'],['#c2bbbb','Light Grey'],['#c7e5ff','Ice']],
      accents: [['#8faed6','Blue'],['#c2c2f5','Lavender']],
      avoid: [['#6a330b','Brown'],['#000000','Black'],['#d63a00','Orange']],
      metals: 'Silver · White gold (cool and matte)', metalPrimary: 'Silver',
      foundation: { undertone: 'Cool, rosy-neutral', fenty: '220-280 (C-series)', mac: 'NC30-37 cool', loreal: 'C4-6', tip: 'True cool-pink base — avoid any peach undertone.' },
      blush: [['#ff8d9e','Soft Pink']],
      bronzer: [['#cca26a','Light Cool Tan']],
      highlighter: [['#ffc7da','Rose Pearl']],
      eyeEveryday: [['#c2bbbb','Soft Grey'],['#c2c2f5','Lavender']],
      eyeDrama: [['#8faed6','Dusty Blue']],
      eyeliner: [['#595050','Soft Grey']],
      lipEveryday: [['#ff8d9e','Soft Pink']],
      lipBold: [['#ff40a0','Cool Rose']],
      lipNude: [['#f793b6','Pink Nude']],
      lipProducts: 'NARS Dolce Vita, MAC Mehr, Charlotte Tilbury Pillow Talk Medium',
      face: 'Features vary.',
      hair: 'Ash brown, cool taupe blonde, soft cool black.',
      hairDirection: 'Stay cool and muted — avoid warm honey or gold tones.',
      cuts: 'Soft bob, layered mid-length',
      bangs: 'Soft side-swept YES',
      lengths: 'Shoulder to mid-back',
      stylingTips: 'Cool-toned gloss, soft waves',
      glasses: { best: 'Cool grey tortoise, silver wire, dusty blue acetate', colors: [['#9d5f25','Rose Gold'],['#b0a7a7','Silver']], avoid: [['#000000','Black']], sunglasses: 'Grey-tinted, cool tortoise', brands: 'Ray-Ban Round Metal silver, Warby Parker Louise' }
    },
    "Soft Summer": {
      best: [['#b2c0d2','Powder Blue'],['#f9b2bd','Light Pink'],['#e1e1f5','Lavender'],['#afe4e4','Pale Turquoise']],
      neutrals: [['#f0f0f0','Soft White'],['#cecece','Light Grey'],['#e8f3fd','Ice']],
      accents: [['#b2c0d2','Blue'],['#e1e1f5','Lavender']],
      avoid: [['#77421d','Brown'],['#000000','Black'],['#e24b12','Orange']],
      metals: 'Brushed silver · Matte platinum', metalPrimary: 'Silver',
      foundation: { undertone: 'Cool-muted, soft pink-grey', fenty: '160-220', mac: 'NW20-30', loreal: 'C3-5', tip: 'Soft satin finish — avoid high shimmer or warmth.' },
      blush: [['#f9b2bd','Soft Pink']],
      bronzer: [['#c2ad91','Light Cool Tan']],
      highlighter: [['#fde8ef','Rose Pearl']],
      eyeEveryday: [['#cecece','Soft Grey'],['#e1e1f5','Lavender']],
      eyeDrama: [['#b2c0d2','Dusty Blue']],
      eyeliner: [['#646464','Soft Grey']],
      lipEveryday: [['#f9b2bd','Soft Pink']],
      lipBold: [['#f36baf','Cool Rose']],
      lipNude: [['#f1b8cc','Pink Nude']],
      lipProducts: 'MAC Mehr, NARS Angelika, Charlotte Tilbury Pillow Talk Original',
      face: 'Features vary.',
      hair: 'Soft ash brown, dove grey-blonde, muted taupe.',
      hairDirection: 'Keep tones soft and greyed — avoid gold or brassy warmth.',
      cuts: 'Soft layers, loose waves, textured lob',
      bangs: 'Soft wispy YES',
      lengths: 'Shoulder length flatters most',
      stylingTips: 'Matte texture spray, soft diffused waves',
      glasses: { best: 'Dove grey acetate, brushed silver, soft taupe tortoise', colors: [['#9f6f42','Rose Gold'],['#bbbbbb','Silver']], avoid: [['#000000','Black']], sunglasses: 'Soft grey-tinted, muted tortoise', brands: 'Warby Parker Haskell, Oliver Peoples Gregory Peck' }
    }
  };
  return P[season] || P['Deep Autumn'];
}

function renderResults(a) {
  const p = a.palette;
  const metal = p.metalPrimary || 'Gold';
  const html = `
    <div class="season">
      <div class="tl">YOUR COLOUR SEASON</div>
      <div class="nm">${a.season}</div>
      <div class="sb">${a.sub}</div>
      <div class="tgs">
        <div class="tg"><div class="l">Undertone</div><div class="v">${a.undertone}</div></div>
        <div class="tg"><div class="l">Contrast</div><div class="v">${a.contrast}</div></div>
        <div class="tg"><div class="l">Depth</div><div class="v">${a.depth}</div></div>
        <div class="tg"><div class="l">Clarity</div><div class="v">${a.clarity}</div></div>
      </div>
      <button class="save-btn" onclick="saveReport()">💾 Save Report</button>
    </div>

    <div class="tabs">
      <button class="tab active" onclick="st('t-start', this)">🌱 Start</button>
      <button class="tab" onclick="st('t-color', this)">🎨 Color</button>
      <button class="tab" onclick="st('t-casual', this)">👕 Casual</button>
      <button class="tab" onclick="st('t-formal', this)">💼 Formal</button>
      <button class="tab" onclick="st('t-occ', this)">✨ Occasion</button>
      <button class="tab" onclick="st('t-makeup', this)">💄 Makeup</button>
      <button class="tab" onclick="st('t-placement', this)">✏️ Placement</button>
      <button class="tab" onclick="st('t-hair', this)">💇 Hair</button>
      <button class="tab" onclick="st('t-glasses', this)">👓 Glasses</button>
      <button class="tab" onclick="st('t-climate', this)">🌦️ Climate</button>
      <button class="tab" onclick="st('t-brands', this)">🛍️ Brands</button>
      <button class="tab" onclick="st('t-looks', this)">⭐ Looks</button>
    </div>

    <div id="t-start" class="sec vis">
      <div class="st">🌱 Beginner's Starter Guide</div>
      <p style="font-size:13px; color:#555; margin-bottom:14px">New to styling? These simple rules work 90% of the time.</p>
      <div class="starter-box"><div class="sbt">🎯 The One Rule</div><div class="sbb">When in doubt, pick ${a.warm ? 'colours like spices, autumn leaves, warm earth: cinnamon, paprika, olive, mustard, rust, burgundy, chocolate' : 'cool jewel tones: sapphire, emerald, true red, berry, cool pink'}. These <strong>always</strong> work on you.</div></div>
      <div class="starter-box"><div class="sbt">👛 Your 10-Piece Starter Wardrobe</div><div class="checklist">
        <div>1 cream or ivory tee (not stark white)</div>
        <div>1 ${p.best[0][1]} knit top</div>
        <div>1 ${p.best[2][1]} button-up shirt</div>
        <div>1 pair dark wash straight-leg jeans</div>
        <div>1 pair black / ${p.neutrals[0][1]} trousers</div>
        <div>1 ${p.neutrals[0][1]} blazer</div>
        <div>1 pair cognac / tan ankle boots</div>
        <div>1 cream or black sneakers</div>
        <div>1 ${metal.toLowerCase()} necklace + ${metal.toLowerCase()} hoop earrings</div>
        <div>1 warm tortoise sunglasses</div>
      </div></div>
      <div class="st" style="margin-top:16px">👟 How to Build an Outfit (5 Steps)</div>
      <div class="numbered-step"><div class="nsh"><div class="num">1</div>Pick the occasion</div><div class="nsb">Casual? Office? Dinner? This decides shape.</div></div>
      <div class="numbered-step"><div class="nsh"><div class="num">2</div>Choose your hero colour</div><div class="nsb">One statement piece in your palette.</div></div>
      <div class="numbered-step"><div class="nsh"><div class="num">3</div>Add a neutral base</div><div class="nsb">Cream, chocolate, black, or warm sand.</div></div>
      <div class="numbered-step"><div class="nsh"><div class="num">4</div>Pick warm metals</div><div class="nsb">${metal} earrings, ${metal.toLowerCase()} necklace, matching belt.</div></div>
      <div class="numbered-step"><div class="nsh"><div class="num">5</div>Finish with lip + liner</div><div class="nsb">Bare face + warm liner + ${p.lipEveryday[0][1].toLowerCase()} lip = pulled-together. 60 seconds.</div></div>
    </div>

    <div id="t-color" class="sec">
      <div class="st">🎨 Your Colour Palette</div>
      <div style="display:flex; gap:16px; align-items:flex-start; flex-wrap:wrap; margin-bottom:12px; padding:14px; background:var(--rose-light); border-radius:12px;">
        <div style="flex:none;">${colorWheelSVG(a.warm, a.skinHue)}</div>
        <p style="flex:1; min-width:180px; font-size:13px; color:#444; line-height:1.6; margin:0;">${seasonExplainer(a)}</p>
      </div>
      <div style="padding:12px 14px; background:var(--cream); border-radius:12px; margin-bottom:12px; border:1px solid #e8dcc9;">
        <div style="font-size:11px; font-weight:800; color:var(--rose); letter-spacing:1px; margin-bottom:4px;">SIMILAR COLOURING, FOR REFERENCE</div>
        <div style="font-size:13px; color:#444; line-height:1.5;">${(SEASON_CELEBRITIES[a.season] || []).join(' · ')} are commonly cited in colour-analysis communities as ${a.season} examples — this is pop-culture consensus, not a verified fact about them, and different analysts categorise the same person differently.</div>
      </div>
      <div style="padding:12px 14px; background:#fff8ec; border-radius:12px; margin-bottom:16px; border:1px solid #ffd5a0; font-size:12.5px; color:#555; line-height:1.6;">${ACCURACY_NOTE}</div>
      <div class="sl">BEST CLOTHING COLOURS</div>
      <div class="sw">${p.best.map(c => `<div class="dot"><div class="c" style="background:${c[0]}"></div><div class="n">${c[1]}</div><div class="h">${c[0]}</div></div>`).join('')}</div>
      <div class="sl">NEUTRALS</div>
      <div class="sw">${p.neutrals.map(c => `<div class="dot"><div class="c" style="background:${c[0]}"></div><div class="n">${c[1]}</div></div>`).join('')}</div>
      <div class="sl">ACCENT COLOURS</div>
      <div class="sw">${p.accents.map(c => `<div class="dot"><div class="c" style="background:${c[0]}"></div><div class="n">${c[1]}</div></div>`).join('')}</div>
      <div class="sl">AVOID</div>
      <div class="sw">${p.avoid.map(c => `<div class="dot avoid-x"><div class="c" style="background:${c[0]}"></div><div class="n">${c[1]}</div></div>`).join('')}</div>
      <div class="row" style="margin-top:14px"><div class="rl">Metals</div><div class="rv">${p.metals}</div></div>
    </div>

    <div id="t-casual" class="sec">
      <div class="st">👕 Casual Outfits (10 Ideas)</div>
      ${casualOutfits(p, metal).map(o => `<div class="outfit-card"><div class="on">${o.n}</div><div class="od">${o.d}</div><div class="ocp">${o.p.map(x => `<span class="pill${x.strong?' strong':''}">${x.t||x}</span>`).join('')}</div></div>`).join('')}
    </div>

    <div id="t-formal" class="sec">
      <div class="st">💼 Formal Outfits (8 Ideas)</div>
      ${formalOutfits(p, metal).map(o => `<div class="outfit-card"><div class="on">${o.n}</div><div class="od">${o.d}</div><div class="ocp">${o.p.map(x => `<span class="pill${x.strong?' strong':''}">${x.t||x}</span>`).join('')}</div></div>`).join('')}
    </div>

    <div id="t-occ" class="sec">
      <div class="st">✨ Occasion Outfits (10 Ideas)</div>
      ${occasionOutfits(p, metal).map(o => `<div class="outfit-card"><div class="on">${o.n}</div><div class="od">${o.d}</div><div class="ocp">${o.p.map(x => `<span class="pill${x.strong?' strong':''}">${x.t||x}</span>`).join('')}</div></div>`).join('')}
    </div>

    <div id="t-makeup" class="sec">
      <div class="st">🫙 Foundation (${p.foundation.undertone.split('.')[0]})</div>
      <div class="row"><div class="rl">Direction</div><div class="rv">${p.foundation.undertone}</div></div>
      <div class="row"><div class="rl">Fenty Beauty</div><div class="rv">${p.foundation.fenty}</div></div>
      <div class="row"><div class="rl">MAC</div><div class="rv">${p.foundation.mac}</div></div>
      <div class="row"><div class="rl">L'Oréal True Match</div><div class="rv">${p.foundation.loreal}</div></div>
      <div class="row"><div class="rl">Tip</div><div class="rv">${p.foundation.tip}</div></div>
      <div class="st" style="margin-top:16px">🌸 Blush</div>
      <div class="sw">${p.blush.map(c => `<div class="dot"><div class="c" style="background:${c[0]}"></div><div class="n">${c[1]}</div></div>`).join('')}</div>
      <div class="st" style="margin-top:16px">☀️ Bronzer</div>
      <div class="sw">${p.bronzer.map(c => `<div class="dot"><div class="c" style="background:${c[0]}"></div><div class="n">${c[1]}</div></div>`).join('')}</div>
      <div class="st" style="margin-top:16px">✨ Highlighter</div>
      <div class="sw">${p.highlighter.map(c => `<div class="dot"><div class="c" style="background:${c[0]}"></div><div class="n">${c[1]}</div></div>`).join('')}</div>
      <div class="st" style="margin-top:16px">👁️ Eyeshadow</div>
      <div class="sl">EVERYDAY</div>
      <div class="sw">${p.eyeEveryday.map(c => `<div class="dot"><div class="c" style="background:${c[0]}"></div><div class="n">${c[1]}</div></div>`).join('')}</div>
      <div class="sl">DRAMATIC / EVENING</div>
      <div class="sw">${p.eyeDrama.map(c => `<div class="dot"><div class="c" style="background:${c[0]}"></div><div class="n">${c[1]}</div></div>`).join('')}</div>
      <div class="st" style="margin-top:16px">🖊️ Eyeliner</div>
      <div class="sw">${p.eyeliner.map(c => `<div class="dot"><div class="c" style="background:${c[0]}"></div><div class="n">${c[1]}</div></div>`).join('')}</div>
      <div class="st" style="margin-top:16px">💋 Lips</div>
      <div class="sl">EVERYDAY</div>
      <div class="sw">${p.lipEveryday.map(c => `<div class="dot"><div class="c" style="background:${c[0]}"></div><div class="n">${c[1]}</div></div>`).join('')}</div>
      <div class="sl">BOLD</div>
      <div class="sw">${p.lipBold.map(c => `<div class="dot"><div class="c" style="background:${c[0]}"></div><div class="n">${c[1]}</div></div>`).join('')}</div>
      <div class="sl">NUDE</div>
      <div class="sw">${p.lipNude.map(c => `<div class="dot"><div class="c" style="background:${c[0]}"></div><div class="n">${c[1]}</div></div>`).join('')}</div>
      <div class="row" style="margin-top:10px"><div class="rl">Shop</div><div class="rv">${p.lipProducts}</div></div>
    </div>

    <div id="t-placement" class="sec">
      <div class="st">🎯 Makeup Placement Guide</div>
      <div class="zn"><div class="zl">Blush</div><div class="zv">Apples of cheeks angled up toward temples. Keep on the fleshy apple, not under the cheekbone.</div></div>
      <div class="zn"><div class="zl">Contour</div><div class="zv">Light touch — under cheekbones, hairline, jaw. Avoid heavy sculpting on structured faces.</div></div>
      <div class="zn"><div class="zl">Highlight</div><div class="zv">${metal} or copper only. Tops of cheekbones, nose bridge, cupid's bow, inner corners.</div></div>
      <div class="zn"><div class="zl">Eyeshadow</div><div class="zv">Apply shadow slightly above the crease so it shows when eyes are open. Blend outer corner up and out.</div></div>
      <div class="zn"><div class="zl">Eyeliner</div><div class="zv">Tightline upper waterline, thin wing lifted up. Avoid heavy lower waterline — closes the eye.</div></div>
      <div class="zn"><div class="zl">Brows</div><div class="zv">Soft arch with warm dark brown pencil (not black). Brush up with spoolie.</div></div>
      <div class="zn"><div class="zl">Lips</div><div class="zv">Line natural edge. Slightly overdraw lower lip for more volume.</div></div>
    </div>

    <div id="t-hair" class="sec">
      <div class="st">🌈 Hair Colors</div>
      <div class="row"><div class="rl">Best Shades</div><div class="rv">${p.hair}</div></div>
      <div class="row"><div class="rl">Direction</div><div class="rv">${p.hairDirection}</div></div>
      <div class="st" style="margin-top:14px">✂️ Hairstyle</div>
      <div class="row"><div class="rl">Best Cuts</div><div class="rv">${p.cuts}</div></div>
      <div class="row"><div class="rl">Length</div><div class="rv">${p.lengths}</div></div>
      <div class="row"><div class="rl">Bangs</div><div class="rv">${p.bangs}</div></div>
      <div class="row"><div class="rl">Styling</div><div class="rv">${p.stylingTips}</div></div>
    </div>

    <div id="t-glasses" class="sec">
      <div class="st">👓 Glasses & Sunglasses</div>
      <p style="font-size:12px; color:#666; margin-bottom:12px">Focus on frame <strong>colours</strong> in your palette.</p>
      <div class="row"><div class="rl">Top Pick</div><div class="rv">${p.glasses.best}</div></div>
      <div class="glasses-grid">
        <div class="glass-card"><svg class="glass-svg" viewBox="0 0 120 50"><ellipse cx="30" cy="25" rx="20" ry="14" fill="none" stroke="${p.glasses.colors[0][0]}" stroke-width="3"/><ellipse cx="90" cy="25" rx="20" ry="14" fill="none" stroke="${p.glasses.colors[0][0]}" stroke-width="3"/><line x1="50" y1="25" x2="70" y2="25" stroke="${p.glasses.colors[0][0]}" stroke-width="2"/></svg><div class="glass-name">Round ${p.glasses.colors[0][1]}</div><div class="glass-why">Softens features.</div><span class="glass-tag">★ TOP</span></div>
        <div class="glass-card"><svg class="glass-svg" viewBox="0 0 120 50"><path d="M 10 18 L 50 18 L 48 36 L 12 36 Z" fill="none" stroke="${p.glasses.colors[1] ? p.glasses.colors[1][0] : '#704214'}" stroke-width="3"/><path d="M 70 18 L 110 18 L 108 36 L 72 36 Z" fill="none" stroke="${p.glasses.colors[1] ? p.glasses.colors[1][0] : '#704214'}" stroke-width="3"/><line x1="50" y1="22" x2="70" y2="22" stroke="${p.glasses.colors[1] ? p.glasses.colors[1][0] : '#704214'}" stroke-width="2"/></svg><div class="glass-name">Rectangle</div><div class="glass-why">Office professional.</div><span class="glass-tag">OFFICE</span></div>
        <div class="glass-card"><svg class="glass-svg" viewBox="0 0 120 50"><path d="M 10 20 Q 10 10 30 10 L 50 10 Q 55 10 50 18 L 48 32 Q 45 40 30 40 Q 10 40 10 30 Z" fill="none" stroke="${p.glasses.colors[0][0]}" stroke-width="3"/><path d="M 70 10 Q 90 10 110 10 L 108 32 Q 105 40 90 40 Q 70 40 70 25 Z" fill="none" stroke="${p.glasses.colors[0][0]}" stroke-width="3"/><line x1="50" y1="20" x2="70" y2="20" stroke="${p.glasses.colors[0][0]}" stroke-width="2"/></svg><div class="glass-name">Cat-Eye</div><div class="glass-why">Lifts eye shape.</div><span class="glass-tag">EVENING</span></div>
        <div class="glass-card"><svg class="glass-svg" viewBox="0 0 120 50"><path d="M 8 18 L 52 18 L 48 36 L 12 36 Z" fill="none" stroke="${p.glasses.colors[2] ? p.glasses.colors[2][0] : '#B8860B'}" stroke-width="2.5"/><path d="M 68 18 L 112 18 L 108 36 L 72 36 Z" fill="none" stroke="${p.glasses.colors[2] ? p.glasses.colors[2][0] : '#B8860B'}" stroke-width="2.5"/><line x1="52" y1="22" x2="68" y2="22" stroke="${p.glasses.colors[2] ? p.glasses.colors[2][0] : '#B8860B'}" stroke-width="2"/></svg><div class="glass-name">${metal} Aviator</div><div class="glass-why">${metal} flatters your undertone.</div><span class="glass-tag">CASUAL</span></div>
      </div>
      <div class="sl">FRAME COLOURS</div>
      <div class="sw">${p.glasses.colors.map(c => `<div class="dot"><div class="c" style="background:${c[0]}"></div><div class="n">${c[1]}</div></div>`).join('')}</div>
      <div class="sl">AVOID</div>
      <div class="sw">${p.glasses.avoid.map(c => `<div class="dot avoid-x"><div class="c" style="background:${c[0]}"></div><div class="n">${c[1]}</div></div>`).join('')}</div>
      <div class="st" style="margin-top:14px">🕶️ Sunglasses</div>
      <div class="row"><div class="rl">Best</div><div class="rv">${p.glasses.sunglasses}</div></div>
      <div class="row"><div class="rl">Brands</div><div class="rv">${p.glasses.brands}</div></div>
    </div>

    <div id="t-climate" class="sec">
      <div class="st">🌦️ Climate-Aware Styling</div>
      <div class="climate-card"><div class="chd">❄️ COLD (below 12°C)</div><div class="cbody"><strong>Layer up:</strong> ${p.neutrals[0][1]} wool coat over ${p.best[0][1]} knit, cognac boots. Scarf in ${p.best[5] ? p.best[5][1] : p.best[2][1]}.</div><div class="fabric-row"><span class="fab">Wool</span><span class="fab">Cashmere</span><span class="fab">Suede</span><span class="fab">Leather</span></div></div>
      <div class="climate-card"><div class="chd">🌧️ WET / RAINY</div><div class="cbody"><strong>Water-smart:</strong> Camel trench, olive barbour jacket, ${p.best[0][1]} raincoat. Waterproof chelsea boots. Avoid suede.</div><div class="fabric-row"><span class="fab">Waxed cotton</span><span class="fab">Technical nylon</span></div></div>
      <div class="climate-card"><div class="chd">🌤️ MILD (12–20°C)</div><div class="cbody"><strong>Versatile:</strong> ${p.best[0][1]} cardigan over cream tee, olive utility jacket, cognac ankle boots.</div><div class="fabric-row"><span class="fab">Linen blend</span><span class="fab">Cotton knit</span><span class="fab">Denim</span></div></div>
      <div class="climate-card"><div class="chd">☀️ WARM (20–28°C)</div><div class="cbody"><strong>Flowy neutrals:</strong> Cream linen dress, ${p.best[5] ? p.best[5][1] : 'burnt sienna'} midi skirt, olive wrap top. ${metal} jewellery.</div><div class="fabric-row"><span class="fab">Linen</span><span class="fab">Silk</span><span class="fab">Viscose</span></div></div>
      <div class="climate-card"><div class="chd">🔥 HOT (above 28°C)</div><div class="cbody"><strong>Breathable:</strong> Rust slip dress, olive linen shorts + cream cami, cognac sandals. Straw hat. SPF 50+.</div><div class="fabric-row"><span class="fab">Pure linen</span><span class="fab">Cotton muslin</span></div></div>
      <div class="climate-card"><div class="chd">💨 WINDY</div><div class="cbody"><strong>Secure:</strong> Hair in low bun. Fitted silhouettes. Belted trench. Skip wide-brim hats.</div></div>
      <div class="climate-card"><div class="chd">☀️ HIGH UV (AU)</div><div class="cbody"><strong>Protect:</strong> SPF 50+ daily (even winter). Mineral sunscreens suit warm skin. UPF clothing for outdoors. AS/NZS 1067 sunglasses.</div></div>
    </div>

    <div id="t-brands" class="sec">
      <div class="st">🛍️ Shoppable Brands (AU-friendly)</div>
      <div class="sl">BUDGET CLOTHING</div>
      <div class="brand-grid">
        <div class="brand-card"><div class="bn">UNIQLO</div><div class="bp">$ · Chadstone, QV</div><div class="bw">U-Collection basics in your palette.</div></div>
        <div class="brand-card"><div class="bn">COS</div><div class="bp">$$ · Collins St</div><div class="bw">Minimalist cuts in warm neutrals.</div></div>
        <div class="brand-card"><div class="bn">H&M</div><div class="bp">$ · Nationwide</div><div class="bw">Seasonal palette trend pieces.</div></div>
        <div class="brand-card"><div class="bn">Glassons</div><div class="bp">$ · AU/NZ</div><div class="bw">Burgundy knits, olive jackets.</div></div>
        <div class="brand-card"><div class="bn">Kmart / Target</div><div class="bp">$</div><div class="bw">Cream basics, cognac boots.</div></div>
        <div class="brand-card"><div class="bn">Cotton On</div><div class="bp">$</div><div class="bw">Autumnal palette essentials.</div></div>
      </div>
      <div class="sl" style="margin-top:14px">MID-RANGE</div>
      <div class="brand-grid">
        <div class="brand-card"><div class="bn">Country Road</div><div class="bp">$$ · AU</div><div class="bw">Camel coats, cream silks.</div></div>
        <div class="brand-card"><div class="bn">Witchery</div><div class="bp">$$ · AU</div><div class="bw">Olive & burgundy knits.</div></div>
        <div class="brand-card"><div class="bn">Seed Heritage</div><div class="bp">$$ · AU</div><div class="bw">Earth tones workwear.</div></div>
        <div class="brand-card"><div class="bn">& Other Stories</div><div class="bp">$$</div><div class="bw">Rust & burgundy pieces.</div></div>
        <div class="brand-card"><div class="bn">Massimo Dutti</div><div class="bp">$$</div><div class="bw">Luxury-feel camels.</div></div>
        <div class="brand-card"><div class="bn">Arket</div><div class="bp">$$</div><div class="bw">Scandi minimalism warm.</div></div>
      </div>
      <div class="sl" style="margin-top:14px">INDIAN / ETHNIC</div>
      <div class="brand-grid">
        <div class="brand-card"><div class="bn">FabIndia</div><div class="bp">$$</div><div class="bw">Earth-tone kurtas, sarees.</div></div>
        <div class="brand-card"><div class="bn">Anita Dongre</div><div class="bp">$$$</div><div class="bw">Burgundy & oxblood festive.</div></div>
        <div class="brand-card"><div class="bn">Sabyasachi</div><div class="bp">$$$$</div><div class="bw">Signature lehengas.</div></div>
        <div class="brand-card"><div class="bn">Suta</div><div class="bp">$$</div><div class="bw">Handloom in rust, mustard.</div></div>
      </div>
      <div class="sl" style="margin-top:14px">MAKEUP (AU)</div>
      <div class="brand-grid">
        <div class="brand-card"><div class="bn">Fenty Beauty</div><div class="bp">Sephora</div><div class="bw">Foundation ${p.foundation.fenty}.</div></div>
        <div class="brand-card"><div class="bn">MAC</div><div class="bp">Myer, DJ</div><div class="bw">${p.foundation.mac} foundation.</div></div>
        <div class="brand-card"><div class="bn">Charlotte Tilbury</div><div class="bp">Mecca</div><div class="bw">Pillow Talk Deep, Bronze palettes.</div></div>
        <div class="brand-card"><div class="bn">NARS</div><div class="bp">Mecca</div><div class="bw">Orgasm X blush.</div></div>
        <div class="brand-card"><div class="bn">Rare Beauty</div><div class="bp">Sephora</div><div class="bw">Soft Pinch blush warm.</div></div>
        <div class="brand-card"><div class="bn">NYX</div><div class="bp">Priceline</div><div class="bw">Lingerie liquid lip Sable.</div></div>
      </div>
      <div class="sl" style="margin-top:14px">SHOES & BAGS</div>
      <div class="brand-grid">
        <div class="brand-card"><div class="bn">Wittner</div><div class="bp">$$ · AU</div><div class="bw">Cognac boots, chocolate pumps.</div></div>
        <div class="brand-card"><div class="bn">Mimco</div><div class="bp">$$$ · AU</div><div class="bw">Cognac/gold leather bags.</div></div>
        <div class="brand-card"><div class="bn">Dr. Martens</div><div class="bp">$$$</div><div class="bw">Chunky chocolate boots.</div></div>
        <div class="brand-card"><div class="bn">Vans/Converse</div><div class="bp">$</div><div class="bw">Cream canvas sneakers.</div></div>
      </div>
      <div class="sl" style="margin-top:14px">EYEWEAR (AU)</div>
      <div class="brand-grid">
        <div class="brand-card"><div class="bn">Oscar Wylee</div><div class="bp">$$ · AU</div><div class="bw">2-for-1 tortoise deals.</div></div>
        <div class="brand-card"><div class="bn">Bailey Nelson</div><div class="bp">$$ · AU</div><div class="bw">Melbourne-born warm acetate.</div></div>
        <div class="brand-card"><div class="bn">Specsavers</div><div class="bp">$ · AU</div><div class="bw">Health fund covered.</div></div>
        <div class="brand-card"><div class="bn">Ray-Ban</div><div class="bp">$$$</div><div class="bw">Jackie Ohh, Clubmaster.</div></div>
      </div>
      <div class="sl" style="margin-top:14px">JEWELLERY (${metal.toUpperCase()})</div>
      <div class="brand-grid">
        <div class="brand-card"><div class="bn">Lovisa</div><div class="bp">$</div><div class="bw">Affordable ${metal.toLowerCase()} hoops.</div></div>
        <div class="brand-card"><div class="bn">Mejuri</div><div class="bp">$$$</div><div class="bw">Fine ${metal.toLowerCase()}-filled pieces.</div></div>
        <div class="brand-card"><div class="bn">Reliquia</div><div class="bp">$$$ · AU</div><div class="bw">Melbourne brand statement.</div></div>
        <div class="brand-card"><div class="bn">Tanishq</div><div class="bp">$$$$</div><div class="bw">22k gold jhumkas for festive.</div></div>
      </div>
    </div>

    <div id="t-looks" class="sec">
      <div class="st">⭐ Signature Looks</div>
      <div class="outfit-card"><div class="on">☀️ Everyday</div><div class="od">Light coverage foundation. ${p.blush[0][1]} blush on apples. ${p.eyeEveryday[0][1]} lid, ${p.eyeEveryday[2] ? p.eyeEveryday[2][1] : 'cocoa'} crease, tightlined ${p.eyeliner[0][1]} liner. ${p.lipEveryday[0][1]} lip. ${metal} studs. Natural waves.</div></div>
      <div class="outfit-card"><div class="on">💼 Office</div><div class="od">Medium coverage, soft contour, ${metal.toLowerCase()} highlighter. ${p.eyeEveryday[1][1]} lid, ${p.eyeEveryday[3] ? p.eyeEveryday[3][1] : 'espresso'} crease, thin brown wing. ${p.lipNude[1] ? p.lipNude[1][1] : 'nude'} nude lip. ${p.best[0][1]} blouse. Sleek half-up.</div></div>
      <div class="outfit-card"><div class="on">🌙 Evening / Glam</div><div class="od">Full coverage, bronze contour, ${p.highlighter[1] ? p.highlighter[1][1] : 'copper'} highlighter. ${p.eyeDrama[3] ? p.eyeDrama[3][1] : 'copper foil'} lid + ${p.eyeDrama[4] ? p.eyeDrama[4][1] : 'oxblood'} crease. Jet black wing. ${p.lipBold[0][1]} lip. ${p.best[0][1]} dress + ${metal.toLowerCase()}.</div></div>
      <div class="st" style="margin-top:16px">💫 Your Aesthetic</div>
      <p style="font-size:13px; color:#444; line-height:1.6; margin-bottom:12px">You are a ${a.season} — ${a.warm ? 'warmth, richness, depth' : 'coolness, clarity, crisp contrast'}. ${metal} always beats ${metal === 'Gold' ? 'silver' : 'gold'}.</p>
      <div>${a.warm ? '<span class="ag">Warm</span><span class="ag">Rich</span><span class="ag">Earthy-Glam</span>' : '<span class="ag">Cool</span><span class="ag">Clear</span><span class="ag">Striking</span>'}</div>
    </div>
  `;
  document.getElementById('results').innerHTML = html;
  getWeather();
}

function casualOutfits(p, m) {
  const h1 = p.best[0][1], h2 = p.best[2][1], h3 = p.best[3][1];
  const n2 = (p.neutrals[4] || p.neutrals[p.neutrals.length - 1])[1];
  return [
    { n: '1. Coffee Run', d: `${n2} oversized tee + dark denim + cognac sneakers. ${m} hoops.`, p: [n2, 'Dark denim', 'Cognac', {t:`${m} hoops`, strong:true}] },
    { n: '2. Uni / Study', d: `${h3} utility jacket over ${h1} knit, straight jeans, cream sneakers.`, p: [h3, h1, 'Dark denim'] },
    { n: '3. Lunch with Friends', d: `Rust midi dress + chocolate ankle boots + camel coat. ${m} layered necklaces.`, p: ['Rust', 'Camel', 'Chocolate', {t:`${m}`, strong:true}] },
    { n: '4. Shopping Day', d: `Chocolate sweatshirt, olive cargo pants, cream sneakers, bucket hat tan.`, p: ['Chocolate', 'Olive cargo'] },
    { n: '5. Movie Date', d: `${h1} fitted tee, high-waist black jeans, chunky chocolate boots, oversized denim jacket.`, p: [{t:h1, strong:true}, 'Black jeans'] },
    { n: '6. Beach / Picnic', d: `Cream linen jumpsuit, warm tan raffia sandals, straw hat, ${m} hoops.`, p: ['Cream linen', 'Tan sandals'] },
    { n: '7. Gym / Athleisure', d: `Olive sports bra + black leggings, chocolate hoodie, cream sneakers.`, p: ['Olive', 'Chocolate'] },
    { n: '8. Casual Friday', d: `Cream cashmere sweater, dark olive wide-leg trousers, burgundy loafers.`, p: ['Cream knit', {t:'Burgundy loafers', strong:true}] },
    { n: '9. Brunch', d: `Mustard cardigan over espresso slip dress, cognac boots, ${m} hoops.`, p: ['Mustard', 'Espresso'] },
    { n: '10. Travel / Airport', d: `Chocolate wide-leg trousers, cream knit, oversized camel coat, cognac boots.`, p: ['Chocolate', 'Camel coat'] }
  ];
}

function formalOutfits(p, m) {
  const h1 = p.best[0][1], h4 = p.best[4] ? p.best[4][1] : h1;
  return [
    { n: '1. Job Interview', d: `Chocolate blazer + cream silk blouse + black tailored trousers + burgundy pumps. ${m.toLowerCase()} studs.`, p: [{t:'Chocolate blazer', strong:true}, 'Cream blouse'] },
    { n: '2. Everyday Office', d: `${h1} knit top + warm charcoal pencil skirt + chocolate loafers.`, p: [h1, 'Chocolate'] },
    { n: '3. Client Meeting', d: `Camel suit + cream shell top + cognac loafers + chocolate bag.`, p: [{t:'Camel suit', strong:true}, 'Cognac'] },
    { n: '4. Presentation', d: `${h1} wrap dress + nude-brown tights + chocolate pumps + ${m.toLowerCase()} earrings.`, p: [{t:`${h1} dress`, strong:true}] },
    { n: '5. Networking', d: `${h4} silk blouse + black cigarette trousers + chocolate heels.`, p: [h4, 'Black'] },
    { n: '6. Conference', d: `Olive tailored jumpsuit + chocolate belt + cognac flats + minimal ${m.toLowerCase()}.`, p: ['Olive jumpsuit'] },
    { n: '7. Business Casual', d: `Rust turtleneck + chocolate wide-leg trousers + cream wool coat.`, p: ['Rust', 'Chocolate'] },
    { n: '8. Formal Dinner', d: `Deep plum midi dress + chocolate heels + ${m.toLowerCase()} cuff + chocolate clutch.`, p: [{t:'Deep plum', strong:true}] }
  ];
}

function occasionOutfits(p, m) {
  return [
    { n: '1. Wedding (Day)', d: `Burnt sienna midi dress puff sleeves + ${m.toLowerCase()} strappy sandals + ${m.toLowerCase()} clutch.`, p: [{t:'Burnt sienna', strong:true}] },
    { n: '2. Wedding (Evening)', d: `Oxblood satin slip dress + ${m.toLowerCase()} earrings + chocolate heels + berry lip.`, p: [{t:'Oxblood', strong:true}] },
    { n: '3. Birthday Dinner', d: `Deep plum velvet mini + ${m.toLowerCase()} hoops + chocolate boots + crimson lip.`, p: [{t:'Plum velvet', strong:true}] },
    { n: '4. Diwali / Festive', d: `Burgundy silk saree/lehenga + ${m.toLowerCase()} jewellery + bold red lip.`, p: [{t:'Burgundy silk', strong:true}] },
    { n: '5. Date Night', d: `Cream silk cami + chocolate leather midi skirt + cognac heels + ${m.toLowerCase()} layered.`, p: ['Cream', 'Chocolate'] },
    { n: '6. Graduation', d: `Burgundy fit-flare dress + nude-brown heels + ${m.toLowerCase()} studs + chocolate blazer.`, p: [{t:'Burgundy', strong:true}] },
    { n: '7. Cocktail Party', d: `Forest green satin midi + bronze heels + chocolate clutch + copper eye.`, p: ['Forest', {t:'Copper eye', strong:true}] },
    { n: '8. Garden Party', d: `Mustard sundress + raffia sandals tan + straw hat + ${m.toLowerCase()} hoops.`, p: ['Mustard'] },
    { n: '9. NYE / Party', d: `Metallic ${m.toLowerCase()} sequin mini + chocolate heels + crimson lip + bronze eye.`, p: [{t:`${m} sequin`, strong:true}] },
    { n: '10. Concert Night', d: `Oxblood faux leather pants + cream crop + chocolate biker jacket + cognac boots.`, p: ['Oxblood leather'] }
  ];
}

function st(id, btn) {
  document.querySelectorAll('.sec').forEach(s => s.classList.remove('vis'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById(id).classList.add('vis');
  btn.classList.add('active');
  window.scrollTo({top: 300, behavior: 'smooth'});
}

async function getWeather() {
  const loc = document.getElementById('loc').value.trim();
  const out = document.getElementById('wxResult');
  if (!loc) return;
  out.classList.add('show');
  out.innerHTML = '<div style="color:#b5294e; font-size:12px">Looking up...</div>';
  try {
    const geo = await fetch('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(loc) + '&count=1');
    const gd = await geo.json();
    if (!gd.results || !gd.results.length) { out.innerHTML = '<div style="color:#c41e3a; font-size:12px">Location not found.</div>'; return; }
    const p = gd.results[0];
    await fetchWx(p.latitude, p.longitude, p.name + ', ' + (p.country || ''));
  } catch(e) { out.innerHTML = '<div style="color:#c41e3a; font-size:12px">Weather error.</div>'; }
}

function useMyLocation() {
  if (!navigator.geolocation) { alert('Geolocation not available.'); return; }
  navigator.geolocation.getCurrentPosition(async pos => {
    await fetchWx(pos.coords.latitude, pos.coords.longitude, 'Your location');
  }, () => alert('Could not get location.'));
}

async function fetchWx(lat, lon, label) {
  const out = document.getElementById('wxResult');
  out.classList.add('show');
  const wx = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon + '&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1&timezone=auto');
  const d = await wx.json();
  const c = d.current, dy = d.daily;
  const t = Math.round(c.temperature_2m), code = c.weather_code, w = Math.round(c.wind_speed_10m);
  const rp = dy.precipitation_probability_max[0], hi = Math.round(dy.temperature_2m_max[0]), lo = Math.round(dy.temperature_2m_min[0]);
  const cs = {0:'Clear',1:'Mostly clear',2:'Partly cloudy',3:'Overcast',45:'Foggy',51:'Drizzle',61:'Rain',63:'Rain',65:'Heavy rain',71:'Snow',80:'Showers',95:'Storm'};
  const cond = cs[code] || 'Mixed';
  const em = code===0?'☀️':code<3?'🌤️':code===3?'☁️':code<50?'🌫️':code<70?'🌧️':code<80?'❄️':code<90?'🌦️':'⛈️';
  const a = currentAnalysis;
  const h = a ? a.palette.best[0][1] : 'burgundy';
  const n = a ? a.palette.neutrals[0][1] : 'chocolate';
  const m = a ? (a.palette.metalPrimary || 'gold').toLowerCase() : 'gold';
  let outfit, fabric;
  if (t < 12) { outfit = `<strong>Cold:</strong> ${n} wool coat + ${h} knit + cognac boots.`; fabric = 'Wool · Cashmere · Leather'; }
  else if (t < 20) { outfit = `<strong>Mild:</strong> ${h} cardigan over cream tee + dark denim + cognac boots.`; fabric = 'Cotton knit · Denim'; }
  else if (t < 28) { outfit = `<strong>Warm:</strong> Cream linen dress or burnt sienna midi + ${h} wrap top. ${m} jewellery.`; fabric = 'Linen · Silk'; }
  else { outfit = `<strong>Hot:</strong> Rust slip dress or linen shorts + cream cami. Straw hat, SPF 50+.`; fabric = 'Pure linen'; }
  if (rp > 50) outfit += ' <br><strong>Rain:</strong> Trench + waterproof boots. Skip suede.';
  if (w > 25) outfit += ' <br><strong>Windy:</strong> Hair up, belted silhouette.';
  out.innerHTML = `<div class="wx-temp">${em} ${t}°C</div><div class="wx-loc">${label}</div><div class="wx-cond">${cond} · H ${hi}° / L ${lo}° · Rain ${rp}% · Wind ${w} km/h</div><div class="wx-outfit">${outfit}<div style="margin-top:6px"><em>Fabrics:</em> ${fabric}</div></div>`;
}

function saveReport() {
  if (!currentAnalysis) return;
  const a = currentAnalysis;
  const text = `COLORCOMPASS REPORT\n${new Date().toLocaleDateString()}\n\nSEASON: ${a.season}\n${a.sub}\n\nUndertone: ${a.undertone}\nContrast: ${a.contrast}\nDepth: ${a.depth}\n\nBEST COLOURS:\n${a.palette.best.map(c => `  ${c[0]}  ${c[1]}`).join('\n')}\n\nAVOID:\n${a.palette.avoid.map(c => `  ${c[0]}  ${c[1]}`).join('\n')}\n\nMETALS: ${a.palette.metals}\n\nFOUNDATION:\n  Fenty: ${a.palette.foundation.fenty}\n  MAC: ${a.palette.foundation.mac}\n  L'Oréal: ${a.palette.foundation.loreal}\n\nHAIR: ${a.palette.hair}\n\nGenerated by ColorCompass\nhttps://madhumithachalla.github.io/colorcompass/`;
  const blob = new Blob([text], { type: 'text/plain' });
  const a2 = document.createElement('a');
  a2.href = URL.createObjectURL(blob);
  a2.download = `colorcompass-${a.season.toLowerCase().replace(' ','-')}.txt`;
  a2.click();
}
