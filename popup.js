// ─── CONFIG ────────────────────────────────────────────────────────────────
const API_KEY = 'YOUR_API_KEY_HERE'; // Get free key at getsongbpm.com/api
const API_BASE = 'https://api.getsong.co';

// ─── STATE ─────────────────────────────────────────────────────────────────
let bpm = 120;
let beatsPerBar = 4;
let isPlaying = false;
let currentBeat = 0;
let nextBeatTime = 0;
let tapTimes = [];
let audioCtx = null;
let schedulerTimer = null;
let animationFrame = null;

let currentSong = null; // { name, artist, bpm }
let setlist = [];

// ─── DOM REFS ───────────────────────────────────────────────────────────────
const songInput    = document.getElementById('songInput');
const searchBtn    = document.getElementById('searchBtn');
const songCard     = document.getElementById('songCard');
const songNameEl   = document.getElementById('songName');
const songArtistEl = document.getElementById('songArtist');
const bpmBadge     = document.getElementById('bpmBadge');
const searchError  = document.getElementById('searchError');
const searchLoading= document.getElementById('searchLoading');

const bpmDisplay   = document.getElementById('bpmDisplay');
const bpmSlider    = document.getElementById('bpmSlider');
const beatDotsEl   = document.getElementById('beatDots');
const playBtn      = document.getElementById('playBtn');
const minusBtn     = document.getElementById('minusBtn');
const plusBtn      = document.getElementById('plusBtn');
const tapBtn       = document.getElementById('tapBtn');

const addSongBtn   = document.getElementById('addSongBtn');
const setlistEl    = document.getElementById('setlist');
const setlistEmpty = document.getElementById('setlistEmpty');

// ─── BPM LOOKUP ─────────────────────────────────────────────────────────────
async function searchSong(query) {
  showState('loading');
  try {
    // Step 1: search for song
    const searchRes = await fetch(
      `${API_BASE}/search/?api_key=${API_KEY}&type=song&lookup=${encodeURIComponent(query)}`
    );
    const searchData = await searchRes.json();

    if (!searchData.search || searchData.search.length === 0) {
      showState('error'); return;
    }

    const firstResult = searchData.search[0];
    const songId = firstResult.id;

    // Step 2: fetch full song details with BPM
    const songRes = await fetch(
      `${API_BASE}/song/?api_key=${API_KEY}&id=${songId}`
    );
    const songData = await songRes.json();
    const song = songData.song;

    if (!song || !song.tempo) {
      showState('error'); return;
    }

    const foundSong = {
      name: song.title,
      artist: song.artist?.name || 'Unknown Artist',
      bpm: Math.round(parseFloat(song.tempo))
    };

    currentSong = foundSong;
    showSongCard(foundSong);
    setBPM(foundSong.bpm);
    addSongBtn.disabled = false;

  } catch (err) {
    console.error(err);
    showState('error');
  }
}

function showState(state) {
  songCard.classList.add('hidden');
  searchError.classList.add('hidden');
  searchLoading.classList.add('hidden');
  if (state === 'loading') searchLoading.classList.remove('hidden');
  if (state === 'error') searchError.classList.remove('hidden');
  if (state === 'card') songCard.classList.remove('hidden');
}

function showSongCard(song) {
  songNameEl.textContent = song.name;
  songArtistEl.textContent = song.artist;
  bpmBadge.textContent = `${song.bpm} BPM`;
  showState('card');
}

// ─── METRONOME ENGINE ────────────────────────────────────────────────────────
function getAudioContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function scheduleClick(time, isAccent) {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.frequency.value = isAccent ? 1200 : 900;
  osc.type = 'sine';

  gain.gain.setValueAtTime(isAccent ? 0.7 : 0.45, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);

  osc.start(time);
  osc.stop(time + 0.06);
}

function scheduler() {
  const ctx = getAudioContext();
  const secondsPerBeat = 60.0 / bpm;
  const scheduleAhead = 0.1;

  while (nextBeatTime < ctx.currentTime + scheduleAhead) {
    const isAccent = currentBeat === 0;
    scheduleClick(nextBeatTime, isAccent);
    animateBeat(currentBeat, nextBeatTime - ctx.currentTime);
    currentBeat = (currentBeat + 1) % beatsPerBar;
    nextBeatTime += secondsPerBeat;
  }

  schedulerTimer = setTimeout(scheduler, 25);
}

function animateBeat(beatIndex, delay) {
  const dots = beatDotsEl.querySelectorAll('.beat-dot');
  if (!dots[beatIndex]) return;
  setTimeout(() => {
    dots.forEach(d => d.classList.remove('pulse', 'active'));
    dots[beatIndex].classList.add('pulse');
    setTimeout(() => {
      if (dots[beatIndex]) dots[beatIndex].classList.remove('pulse');
    }, 120);
  }, Math.max(0, delay * 1000));
}

function startMetronome() {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  currentBeat = 0;
  nextBeatTime = ctx.currentTime + 0.05;
  scheduler();
  isPlaying = true;
  playBtn.textContent = '⏹  Stop';
  playBtn.classList.add('playing');
}

function stopMetronome() {
  clearTimeout(schedulerTimer);
  isPlaying = false;
  playBtn.textContent = '▶  Play';
  playBtn.classList.remove('playing');
  beatDotsEl.querySelectorAll('.beat-dot').forEach(d => {
    d.classList.remove('pulse', 'active');
  });
}

// ─── BPM CONTROLS ───────────────────────────────────────────────────────────
function setBPM(val) {
  bpm = Math.min(300, Math.max(20, val));
  bpmDisplay.textContent = bpm;
  bpmSlider.value = bpm;
}

bpmSlider.addEventListener('input', () => setBPM(parseInt(bpmSlider.value)));
minusBtn.addEventListener('click', () => setBPM(bpm - 5));
plusBtn.addEventListener('click', () => setBPM(bpm + 5));
playBtn.addEventListener('click', () => isPlaying ? stopMetronome() : startMetronome());

// Tap tempo
tapBtn.addEventListener('click', () => {
  const now = Date.now();
  tapTimes.push(now);
  if (tapTimes.length > 8) tapTimes.shift();

  if (tapTimes.length >= 2) {
    const intervals = [];
    for (let i = 1; i < tapTimes.length; i++) {
      intervals.push(tapTimes[i] - tapTimes[i - 1]);
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    setBPM(Math.round(60000 / avgInterval));
  }

  // Reset tap after 2s inactivity
  clearTimeout(tapBtn._resetTimer);
  tapBtn._resetTimer = setTimeout(() => { tapTimes = []; }, 2000);
});

// ─── TIME SIGNATURE ──────────────────────────────────────────────────────────
document.querySelectorAll('.timesig-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.timesig-btn').forEach(b => b.classList.remove('sel'));
    btn.classList.add('sel');
    beatsPerBar = parseInt(btn.dataset.beats);
    renderBeatDots();
    if (isPlaying) { stopMetronome(); startMetronome(); }
  });
});

function renderBeatDots() {
  beatDotsEl.innerHTML = '';
  for (let i = 0; i < beatsPerBar; i++) {
    const dot = document.createElement('div');
    dot.className = 'beat-dot' + (i === 0 ? ' accent' : '');
    beatDotsEl.appendChild(dot);
  }
}

// ─── SEARCH ──────────────────────────────────────────────────────────────────
searchBtn.addEventListener('click', () => {
  const q = songInput.value.trim();
  if (q) searchSong(q);
});

songInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const q = songInput.value.trim();
    if (q) searchSong(q);
  }
});

// If no API key, use demo mode
function isDemoMode() {
  return API_KEY === 'YOUR_API_KEY_HERE';
}

async function searchSongOrDemo(query) {
  if (isDemoMode()) {
    searchSong_demo(query);
  } else {
    searchSong(query);
  }
}

// Demo mode: fake BPM data for common songs so users can test without an API key
function searchSong_demo(query) {
  showState('loading');
  const demos = {
    'blinding lights': { name: 'Blinding Lights', artist: 'The Weeknd', bpm: 171 },
    'as it was': { name: 'As It Was', artist: 'Harry Styles', bpm: 174 },
    'levitating': { name: 'Levitating', artist: 'Dua Lipa', bpm: 103 },
    'stay': { name: 'STAY', artist: 'The Kid LAROI & Justin Bieber', bpm: 170 },
    'bad guy': { name: 'bad guy', artist: 'Billie Eilish', bpm: 135 },
    'shape of you': { name: 'Shape of You', artist: 'Ed Sheeran', bpm: 96 },
    'uptown funk': { name: 'Uptown Funk', artist: 'Mark Ronson ft. Bruno Mars', bpm: 115 },
    'bohemian rhapsody': { name: 'Bohemian Rhapsody', artist: 'Queen', bpm: 72 },
    'hotel california': { name: 'Hotel California', artist: 'Eagles', bpm: 75 },
    'smells like teen spirit': { name: 'Smells Like Teen Spirit', artist: 'Nirvana', bpm: 117 },
  };

  setTimeout(() => {
    const key = query.toLowerCase().trim();
    const match = Object.keys(demos).find(k => key.includes(k) || k.includes(key));
    if (match) {
      currentSong = demos[match];
      showSongCard(currentSong);
      setBPM(currentSong.bpm);
      addSongBtn.disabled = false;
    } else {
      // Generate a plausible random BPM for unknown songs
      const fakeBpm = Math.floor(Math.random() * 100) + 80;
      currentSong = { name: query, artist: 'Unknown Artist', bpm: fakeBpm };
      showSongCard(currentSong);
      setBPM(fakeBpm);
      addSongBtn.disabled = false;
    }
  }, 600);
}

// Override search to use demo if no API key
searchBtn.addEventListener('click', () => {}, { once: true }); // remove placeholder
searchBtn.onclick = () => {
  const q = songInput.value.trim();
  if (q) searchSongOrDemo(q);
};
songInput.onkeydown = (e) => {
  if (e.key === 'Enter') {
    const q = songInput.value.trim();
    if (q) searchSongOrDemo(q);
  }
};

// ─── SETLIST ─────────────────────────────────────────────────────────────────
addSongBtn.disabled = true;

addSongBtn.addEventListener('click', () => {
  if (!currentSong) return;
  const exists = setlist.find(s => s.name === currentSong.name && s.artist === currentSong.artist);
  if (exists) return;
  setlist.push({ ...currentSong });
  saveSetlist();
  renderSetlist();
});

function renderSetlist() {
  const items = setlistEl.querySelectorAll('.setlist-item');
  items.forEach(i => i.remove());

  if (setlist.length === 0) {
    setlistEmpty.style.display = '';
    return;
  }
  setlistEmpty.style.display = 'none';

  setlist.forEach((song, idx) => {
    const item = document.createElement('div');
    item.className = 'setlist-item';
    if (currentSong && song.name === currentSong.name) item.classList.add('active');

    item.innerHTML = `
      <div class="si-indicator"></div>
      <div class="si-num">${idx + 1}</div>
      <div class="si-info">
        <div class="si-name">${escHtml(song.name)}</div>
        <div class="si-artist">${escHtml(song.artist)}</div>
      </div>
      <div class="si-bpm">${song.bpm}</div>
      <button class="si-delete" title="Remove">×</button>
    `;

    item.querySelector('.si-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      setlist.splice(idx, 1);
      saveSetlist();
      renderSetlist();
    });

    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('si-delete')) return;
      currentSong = song;
      showSongCard(song);
      setBPM(song.bpm);
      renderSetlist();
    });

    setlistEl.appendChild(item);
  });
}

function saveSetlist() {
  chrome.storage.local.set({ metronomly_setlist: setlist });
}

function loadSetlist() {
  chrome.storage.local.get('metronomly_setlist', (data) => {
    if (data.metronomly_setlist) {
      setlist = data.metronomly_setlist;
      renderSetlist();
    }
  });
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
loadSetlist();
renderBeatDots();

// Show demo mode notice if no API key
if (isDemoMode()) {
  const notice = document.createElement('div');
  notice.style.cssText = 'font-size:10px;color:#f59e0b;background:#fffbeb;border:0.5px solid #fde68a;border-radius:6px;padding:5px 10px;margin-bottom:8px;text-align:center;';
  notice.textContent = '⚠ Demo mode — add your API key in popup.js';
  document.querySelector('.section').prepend(notice);
}
