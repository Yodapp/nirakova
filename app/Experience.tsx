"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

type Ripple = { x: number; y: number; life: number; strength: number };
type Particle = { angle: number; radius: number; speed: number; size: number; phase: number; hue: number };
type AudioBands = { bass: number; mids: number; highs: number };
type RepeatMode = "off" | "all" | "one";
type ShareStatus = "idle" | "copied" | "error";

type Track = {
  id: string;
  title: string;
  tagline: string;
  pullQuote: string;
  lyrics: string[][];
  src: string;
  isNew?: boolean;
};

// Each track carries its own identity — title, tagline, permanent pull-quote,
// and rotating lyric lines — so the hero reflects whichever song is playing,
// not just the player bar.
const TRACKS: Track[] = [
  {
    id: "meet-me-in-the-deep",
    title: "Meet Me in the Deep",
    tagline: "Debut single",
    pullQuote: "I won’t lose myself to hold you.",
    lyrics: [
      ["Bring me something I can trust,", "not just something I can feel."],
      ["Not the girl you almost loved."],
      ["Meet me in the deep."],
    ],
    src: "/track.mp3",
  },
  {
    id: "never-learned-your-name",
    title: "Never Learned Your Name",
    tagline: "New single",
    pullQuote: "You’re the one I can’t forget.",
    lyrics: [
      ["No promise, no goodbye —", "just a feeling from that night."],
      ["Maybe it was only a moment,", "maybe that is all it was."],
      ["For one second,", "you were everything I felt."],
    ],
    src: "/never-learned-your-name.mp3",
    isNew: true,
  },
  {
    id: "bad-girl-in-me",
    title: "Bad Girl in Me",
    tagline: "New single",
    pullQuote: "Don’t confuse the way I want you with the way I know my worth.",
    lyrics: [
      ["There’s a bad girl in me", "You only see her when you stay."],
      ["But you make the night feel dangerous", "In a way I’ve never known."],
      ["If you want the girl beneath the surface", "You will have to let her breathe."],
    ],
    src: "/bad-girl-in-me.mp3",
    isNew: true,
  },
];

function initialTrackIndex() {
  if (typeof window === "undefined") return 0;
  const songId = new URLSearchParams(window.location.search).get("song");
  const index = TRACKS.findIndex((track) => track.id === songId);
  return index >= 0 ? index : 0;
}

function formatTime(value: number) {
  const safe = Number.isFinite(value) ? value : 0;
  return `${Math.floor(safe / 60)}:${Math.floor(safe % 60).toString().padStart(2, "0")}`;
}

function averageFrequencyRange(data: Uint8Array<ArrayBuffer>, sampleRate: number, fftSize: number, low: number, high: number) {
  const binWidth = sampleRate / fftSize;
  const from = Math.max(0, Math.floor(low / binWidth));
  const to = Math.min(data.length - 1, Math.ceil(high / binWidth));
  let total = 0;
  for (let index = from; index <= to; index += 1) total += data[index];
  return total / Math.max(1, to - from + 1) / 255;
}

export default function Experience() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveformRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const pointerRef = useRef({ x: 0.5, y: 0.5, active: false });
  const ripplesRef = useRef<Ripple[]>([]);
  const linkHandledRef = useRef(false);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [shareStatus, setShareStatus] = useState<ShareStatus>("idle");
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("all");
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [lyricIndex, setLyricIndex] = useState(0);
  const [trackIndex, setTrackIndex] = useState(initialTrackIndex);
  const [trackDurations, setTrackDurations] = useState<number[]>(() => TRACKS.map(() => 0));

  const currentTrack = TRACKS[trackIndex];

  const updateAddressForTrack = useCallback((index: number) => {
    const url = new URL(window.location.href);
    url.searchParams.set("song", TRACKS[index].id);
    url.searchParams.delete("autoplay");
    window.history.replaceState({}, "", url);
  }, []);

  const copySongLink = useCallback(async () => {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("song", currentTrack.id);
    url.searchParams.set("autoplay", "1");

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url.toString());
      } else {
        const field = document.createElement("textarea");
        field.value = url.toString();
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.select();
        const copied = document.execCommand("copy");
        field.remove();
        if (!copied) throw new Error("Copy unavailable");
      }
      setShareStatus("copied");
    } catch {
      setShareStatus("error");
    }
    window.setTimeout(() => setShareStatus("idle"), 2400);
  }, [currentTrack.id]);

  const requestTiltAccess = useCallback(async () => {
    type PermissionAwareOrientation = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> };
    const Orientation = window.DeviceOrientationEvent as PermissionAwareOrientation | undefined;
    if (Orientation?.requestPermission) {
      try { await Orientation.requestPermission(); } catch { /* Pointer parallax remains available. */ }
    }
  }, []);

  const primeAudio = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audioContextRef.current) {
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.78;
      analyser.minDecibels = -92;
      analyser.maxDecibels = -18;
      const source = context.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(context.destination);
      audioContextRef.current = context;
      analyserRef.current = analyser;
    }
    await audioContextRef.current.resume();
  }, []);

  const enter = useCallback(async () => {
    setStarted(true);
    setAutoplayBlocked(false);
    void requestTiltAccess();
    try {
      await primeAudio();
      await audioRef.current?.play();
    } catch {
      setPlaying(false);
    }
  }, [primeAudio, requestTiltAccess]);

  const togglePlayback = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!started) setStarted(true);
    if (audio.paused) {
      await primeAudio();
      await audio.play();
    } else {
      audio.pause();
    }
  }, [primeAudio, started]);

  // Switch to a given track. Tapping the track that's already playing just
  // toggles play/pause instead of restarting it.
  const playTrackAt = useCallback(async (index: number) => {
    if (index === trackIndex) {
      await togglePlayback();
      return;
    }
    const audio = audioRef.current;
    setTrackIndex(index);
    updateAddressForTrack(index);
    setLyricIndex(0);
    setStarted(true);
    void requestTiltAccess();
    if (!audio) return;
    audio.src = TRACKS[index].src;
    try {
      await primeAudio();
      audio.load();
      await audio.play();
    } catch {
      setPlaying(false);
    }
  }, [trackIndex, togglePlayback, primeAudio, requestTiltAccess, updateAddressForTrack]);

  // Advance through the queue. Wraps to the first track when repeat is set
  // to "all"; with repeat off, playback simply stops after the last track —
  // matching how Spotify/Apple Music handle an un-repeated queue.
  const goToNext = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    const isLast = trackIndex === TRACKS.length - 1;
    if (isLast && repeatMode === "off") {
      setPlaying(false);
      return;
    }
    const nextIndex = isLast ? 0 : trackIndex + 1;
    setTrackIndex(nextIndex);
    updateAddressForTrack(nextIndex);
    setLyricIndex(0);
    audio.src = TRACKS[nextIndex].src;
    try {
      audio.load();
      await audio.play();
    } catch {
      setPlaying(false);
    }
  }, [trackIndex, repeatMode, updateAddressForTrack]);

  const goToPrevious = useCallback(async () => {
    const previousIndex = trackIndex === 0 ? TRACKS.length - 1 : trackIndex - 1;
    await playTrackAt(previousIndex);
  }, [trackIndex, playTrackAt]);

  const cycleRepeat = useCallback(() => {
    setRepeatMode((mode) => (mode === "off" ? "all" : mode === "all" ? "one" : "off"));
  }, []);

  const updatePointer = (event: ReactPointerEvent<HTMLElement>) => {
    pointerRef.current = { x: event.clientX / window.innerWidth, y: event.clientY / window.innerHeight, active: true };
  };

  // A song link selects its track before playback begins. Audible autoplay is
  // attempted, while the visible CTA remains as a one-tap fallback for browser
  // policies that require a gesture before sound can start.
  useEffect(() => {
    if (linkHandledRef.current) return;
    linkHandledRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const songId = params.get("song");
    if (!songId) return;
    const requestedIndex = TRACKS.findIndex((track) => track.id === songId);
    if (requestedIndex < 0) return;

    const audio = audioRef.current;
    if (!audio) return;
    audio.src = TRACKS[requestedIndex].src;
    audio.load();

    if (params.get("autoplay") !== "1") return;
    const attemptAutoplay = async () => {
      try {
        await primeAudio();
        await audio.play();
        setStarted(true);
        setAutoplayBlocked(false);
      } catch {
        setStarted(false);
        setPlaying(false);
        setAutoplayBlocked(true);
      }
    };
    void attemptAutoplay();
  }, [primeAudio]);

  useEffect(() => {
    document.title = `${currentTrack.title} — Nira Kova`;
  }, [currentTrack.title]);

  // Advance the lyric line on a fixed cadence via JS rather than relying on
  // a CSS animationend event — keeps it working the same for everyone,
  // including prefers-reduced-motion users where the fade is disabled.
  useEffect(() => {
    if (!started) return;
    const id = window.setInterval(() => {
      setLyricIndex((index) => (index + 1) % currentTrack.lyrics.length);
    }, 7200);
    return () => window.clearInterval(id);
  }, [started, currentTrack.lyrics.length]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const update = () => setProgress(audio.currentTime || 0);
    const loaded = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const played = () => setPlaying(true);
    const paused = () => setPlaying(false);
    const ended = () => {
      if (repeatMode === "one") return; // native loop handles this; ended won't fire
      void goToNext();
    };
    audio.addEventListener("timeupdate", update);
    audio.addEventListener("loadedmetadata", loaded);
    audio.addEventListener("durationchange", loaded);
    audio.addEventListener("play", played);
    audio.addEventListener("pause", paused);
    audio.addEventListener("ended", ended);
    return () => {
      audio.removeEventListener("timeupdate", update);
      audio.removeEventListener("loadedmetadata", loaded);
      audio.removeEventListener("durationchange", loaded);
      audio.removeEventListener("play", played);
      audio.removeEventListener("pause", paused);
      audio.removeEventListener("ended", ended);
    };
  }, [repeatMode, goToNext]);

  // Quietly preload metadata for every track (not just the loaded one) so
  // the playlist list can show real durations without switching tracks.
  useEffect(() => {
    const loaders = TRACKS.map((track, index) => {
      const probe = new Audio();
      probe.preload = "metadata";
      probe.src = track.src;
      const onLoaded = () => {
        setTrackDurations((previous) => {
          const next = [...previous];
          next[index] = Number.isFinite(probe.duration) ? probe.duration : 0;
          return next;
        });
      };
      probe.addEventListener("loadedmetadata", onLoaded);
      return { probe, onLoaded };
    });
    return () => {
      loaders.forEach(({ probe, onLoaded }) => {
        probe.removeEventListener("loadedmetadata", onLoaded);
        probe.src = "";
      });
    };
  }, []);

  // Lock-screen / notification-shade / media-key controls with the correct
  // track title and artist, and working play, pause, previous and next.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: "Nira Kova",
      album: "Nira Kova",
    });
  }, [currentTrack.title]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.setActionHandler("play", () => { void togglePlayback(); });
    navigator.mediaSession.setActionHandler("pause", () => { void togglePlayback(); });
    navigator.mediaSession.setActionHandler("previoustrack", () => { void goToPrevious(); });
    navigator.mediaSession.setActionHandler("nexttrack", () => { void goToNext(); });
    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
    };
  }, [togglePlayback, goToPrevious, goToNext]);

  useEffect(() => {
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  }, [playing]);

  useEffect(() => {
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.gamma == null || event.beta == null) return;
      const x = Math.max(-1, Math.min(1, event.gamma / 28));
      const y = Math.max(-1, Math.min(1, (event.beta - 45) / 38));
      document.documentElement.style.setProperty("--tilt-x", `${(-y * 4.5).toFixed(2)}deg`);
      document.documentElement.style.setProperty("--tilt-y", `${(x * 6).toFixed(2)}deg`);
    };
    window.addEventListener("deviceorientation", onOrientation, true);
    return () => window.removeEventListener("deviceorientation", onOrientation, true);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const waveform = waveformRef.current;
    const waveContext = waveform?.getContext("2d");
    if (!canvas || !context || !waveform || !waveContext) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nav = navigator as Navigator & { deviceMemory?: number };
    const lowTier = (nav.deviceMemory ?? 4) <= 2 || (nav.hardwareConcurrency ?? 8) <= 4;
    let particleLimit = reducedMotion ? 30 : lowTier ? 72 : window.innerWidth > 1600 ? 180 : 128;
    let width = window.innerWidth;
    let height = window.innerHeight;
    let frame = 0;
    let last = performance.now();
    let fpsWindowStarted = last;
    let fpsFrames = 0;
    let smoothBass = 0;
    let smoothMid = 0;
    let smoothHigh = 0;
    let impact = 0;
    let lightning = 0;
    const bassHistory = Array.from({ length: 42 }, () => 0.12);
    let lastBeat = 0;
    let lastHighFlash = 0;
    const barCount = 22;
    const barLevels = new Float32Array(barCount);

    const particles: Particle[] = Array.from({ length: 190 }, (_, index) => ({
      angle: (index / 190) * Math.PI * 2 + Math.random() * 0.2,
      radius: 90 + Math.random() * Math.min(width, height) * 0.54,
      speed: 0.000035 + Math.random() * 0.00013,
      size: 0.3 + Math.random() * 1.8,
      phase: Math.random() * Math.PI * 2,
      hue: Math.random() > 0.82 ? 198 : 348,
    }));

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, lowTier ? 1.35 : 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const waveRect = waveform.getBoundingClientRect();
      waveform.width = Math.max(1, Math.round(waveRect.width * dpr));
      waveform.height = Math.max(1, Math.round(waveRect.height * dpr));
      waveContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    // Real, audio-reactive bar equalizer — bottom-aligned bars with rounded
    // caps. One vertical gradient spans the whole container (faded steel
    // blue at the baseline, warming to a muted crimson only near the very
    // top) so it reads like a classic VU meter tuned to the site's palette:
    // quiet bars stay cool, only the loudest peaks reach red. Every bar
    // samples the same gradient, so short bars naturally stay blue.
    const drawWaveform = (frequencyData: Uint8Array<ArrayBuffer> | null, bass: number, now: number) => {
      const rect = waveform.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      waveContext.clearRect(0, 0, w, h);

      const gap = Math.max(3, w / barCount * 0.38);
      const barWidth = w / barCount - gap;
      const usableBins = frequencyData ? Math.floor(frequencyData.length * 0.62) : 0;

      const gradient = waveContext.createLinearGradient(0, h, 0, 0);
      gradient.addColorStop(0, `rgba(94,156,206,${0.32 + bass * 0.1})`);
      gradient.addColorStop(0.62, `rgba(176,104,132,${0.4 + bass * 0.12})`);
      gradient.addColorStop(1, `rgba(230,70,88,${0.52 + bass * 0.16})`);
      waveContext.fillStyle = gradient;

      for (let index = 0; index < barCount; index += 1) {
        let target: number;
        if (frequencyData && usableBins > 0) {
          // Slight log-weighting so low bars aren't dominated only by sub-bass.
          const bin = Math.floor((index / barCount) ** 1.25 * usableBins);
          target = frequencyData[Math.min(usableBins - 1, bin)] / 255;
        } else {
          target = 0.05 + Math.sin(now * 0.0018 + index * 0.4) * 0.02;
        }
        const level = barLevels[index];
        barLevels[index] = level + (target - level) * (target > level ? 0.5 : 0.14);

        const barHeight = Math.max(2, barLevels[index] * h * 0.94);
        const x = index * (barWidth + gap);
        const y = h - barHeight;
        const radius = Math.min(barWidth / 2, 3);

        waveContext.beginPath();
        waveContext.moveTo(x, h);
        waveContext.lineTo(x, y + radius);
        waveContext.arcTo(x, y, x + radius, y, radius);
        waveContext.lineTo(x + barWidth - radius, y);
        waveContext.arcTo(x + barWidth, y, x + barWidth, y + radius, radius);
        waveContext.lineTo(x + barWidth, h);
        waveContext.closePath();
        waveContext.fill();
      }
    };

    const readBands = (): { bands: AudioBands; frequencyData: Uint8Array<ArrayBuffer> | null } => {
      const analyser = analyserRef.current;
      const audio = audioRef.current;
      if (!analyser || !audio || audio.paused) return { bands: { bass: 0.025, mids: 0.018, highs: 0.012 }, frequencyData: null };
      const frequencyData = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(frequencyData);
      const sampleRate = audioContextRef.current?.sampleRate ?? 48000;
      return {
        bands: {
          bass: averageFrequencyRange(frequencyData, sampleRate, analyser.fftSize, 20, 150),
          mids: averageFrequencyRange(frequencyData, sampleRate, analyser.fftSize, 150, 2000),
          highs: averageFrequencyRange(frequencyData, sampleRate, analyser.fftSize, 2000, 16000),
        },
        frequencyData,
      };
    };

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const targetFrameMs = lowTier ? 1000 / 45 : 1000 / 60;
      if (now - last < targetFrameMs * 0.78) return;
      const delta = Math.min(now - last, 42);
      last = now;
      fpsFrames += 1;
      if (now - fpsWindowStarted > 2500) {
        const fps = (fpsFrames * 1000) / (now - fpsWindowStarted);
        if (fps < 42 && particleLimit > 48) particleLimit = Math.max(48, Math.floor(particleLimit * 0.78));
        fpsWindowStarted = now;
        fpsFrames = 0;
      }

      const { bands, frequencyData } = readBands();
      smoothBass += (bands.bass - smoothBass) * (bands.bass > smoothBass ? 0.38 : 0.09);
      smoothMid += (bands.mids - smoothMid) * 0.13;
      smoothHigh += (bands.highs - smoothHigh) * 0.18;
      bassHistory.push(bands.bass);
      bassHistory.shift();
      const meanBass = bassHistory.reduce((sum, value) => sum + value, 0) / bassHistory.length;
      const variance = bassHistory.reduce((sum, value) => sum + (value - meanBass) ** 2, 0) / bassHistory.length;
      const dynamicThreshold = Math.max(0.22, meanBass + Math.sqrt(variance) * 1.45);
      if (bands.bass > dynamicThreshold && bands.bass > smoothBass * 1.04 && now - lastBeat > 185) {
        const pointer = pointerRef.current;
        ripplesRef.current.push({ x: (pointer.active ? pointer.x : 0.68) * width, y: (pointer.active ? pointer.y : 0.46) * height, life: 1, strength: Math.min(1.4, bands.bass * 1.65) });
        impact = Math.min(1.4, impact + bands.bass * 1.25);
        lastBeat = now;
      }
      if (bands.highs > 0.36 && now - lastHighFlash > 130 + Math.random() * 260) {
        lightning = Math.min(1, bands.highs * 0.8);
        lastHighFlash = now;
      }
      impact *= 0.86;
      lightning *= 0.77;

      const pointer = pointerRef.current;
      const px = pointer.x * width;
      const py = pointer.y * height;
      const centerX = width * (width < 760 ? 0.54 : 0.71) + (px - width / 2) * 0.04;
      const centerY = height * 0.46 + (py - height / 2) * 0.035;
      const root = document.documentElement.style;
      root.setProperty("--bass", smoothBass.toFixed(3));
      root.setProperty("--mid", smoothMid.toFixed(3));
      root.setProperty("--high", smoothHigh.toFixed(3));
      root.setProperty("--impact", impact.toFixed(3));
      root.setProperty("--lightning", lightning.toFixed(3));
      root.setProperty("--pointer-x", `${(pointer.x * 100).toFixed(2)}%`);
      root.setProperty("--pointer-y", `${(pointer.y * 100).toFixed(2)}%`);
      if (!window.matchMedia("(pointer: coarse)").matches) {
        root.setProperty("--tilt-x", `${((pointer.y - 0.5) * -4.5).toFixed(2)}deg`);
        root.setProperty("--tilt-y", `${((pointer.x - 0.5) * 6).toFixed(2)}deg`);
      }

      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";
      const glow = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, 150 + smoothBass * 340);
      glow.addColorStop(0, `rgba(255,42,78,${0.025 + smoothBass * 0.19})`);
      glow.addColorStop(0.35, `rgba(151,8,38,${0.018 + smoothBass * 0.1})`);
      glow.addColorStop(1, "rgba(70,0,20,0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      if (frequencyData) {
        const bars = width < 700 ? 68 : 112;
        for (let index = 0; index < bars; index += 1) {
          const value = frequencyData[2 + Math.floor((index / bars) * 150)] / 255;
          const angle = (index / bars) * Math.PI * 2 - Math.PI / 2;
          const base = 106 + smoothBass * 42;
          context.beginPath();
          context.moveTo(centerX + Math.cos(angle) * base, centerY + Math.sin(angle) * base);
          context.lineTo(centerX + Math.cos(angle) * (base + 3 + value * 78), centerY + Math.sin(angle) * (base + 3 + value * 78));
          context.lineWidth = 0.35 + value * 1.35;
          context.strokeStyle = `rgba(${index % 13 === 0 ? "70,170,215" : "240,49,79"},${0.055 + value * 0.38})`;
          context.stroke();
        }
      }

      for (let index = 0; index < particleLimit; index += 1) {
        const particle = particles[index];
        particle.angle += particle.speed * delta * (1 + smoothMid * 4.2);
        const radius = particle.radius + Math.sin(now * 0.00055 + particle.phase) * (8 + smoothMid * 28) + smoothBass * 48;
        let x = centerX + Math.cos(particle.angle) * radius;
        let y = centerY + Math.sin(particle.angle) * radius * 0.59;
        const dx = x - px;
        const dy = y - py;
        const distance = Math.hypot(dx, dy);
        if (pointer.active && distance < 145) {
          const force = (145 - distance) / 145;
          x += (dx / Math.max(distance, 1)) * force * 42;
          y += (dy / Math.max(distance, 1)) * force * 42;
        }
        context.beginPath();
        context.arc(x, y, particle.size * (1 + smoothHigh * 2.4), 0, Math.PI * 2);
        context.fillStyle = particle.hue === 198 ? `rgba(54,160,211,${0.06 + smoothHigh * 0.3})` : `rgba(245,66,96,${0.08 + smoothHigh * 0.38})`;
        context.fill();
      }

      ripplesRef.current = ripplesRef.current.filter((ripple) => {
        ripple.life -= delta * 0.00072;
        if (ripple.life <= 0) return false;
        context.beginPath();
        context.arc(ripple.x, ripple.y, (1 - ripple.life) * (180 + ripple.strength * 160), 0, Math.PI * 2);
        context.strokeStyle = `rgba(242,48,82,${ripple.life * 0.48})`;
        context.lineWidth = 0.45 + ripple.life * ripple.strength * 2.4;
        context.stroke();
        return true;
      });
      context.globalCompositeOperation = "source-over";
      drawWaveform(frequencyData, smoothBass, now);
    };

    resize();
    window.addEventListener("resize", resize);
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", resize); };
  }, []);

  return (
    <main className={`experience ${started ? "is-started" : "is-dormant"} ${playing ? "is-playing" : "is-paused"}`} onPointerMove={updatePointer} onPointerLeave={() => { pointerRef.current.active = false; }} onPointerDown={(event) => {
      updatePointer(event);
      if (started) ripplesRef.current.push({ x: event.clientX, y: event.clientY, life: 1, strength: 0.9 });
    }}>
      {/* Music-only tracks; no spoken dialogue requires captions. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio id="audio" ref={audioRef} src={currentTrack.src} preload="metadata" loop={repeatMode === "one"} crossOrigin="anonymous" aria-label={`${currentTrack.title} by Nira Kova`} />
      <div className="wide-memory" aria-hidden="true" />
      <div className="portrait portrait-base" aria-hidden="true" />
      <div className="portrait-shade" aria-hidden="true" />
      <div className="pointer-aura" aria-hidden="true" />
      <canvas ref={canvasRef} className="signal-canvas" aria-hidden="true" />
      <div className="lightning" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <header className="topbar">
        <div className="monogram" aria-label="Nira Kova">NK</div>
        <button
          className={`share-button share-${shareStatus}`}
          type="button"
          onClick={() => void copySongLink()}
          aria-label={`Copy autoplay link for ${currentTrack.title}`}
        >
          <span className="copy-mark" aria-hidden="true"><i /></span>
          <span>{shareStatus === "copied" ? "Link copied" : shareStatus === "error" ? "Copy failed" : "Copy song link"}</span>
        </button>
        <span className="share-announcement" role="status" aria-live="polite">
          {shareStatus === "copied" ? `Autoplay link copied for ${currentTrack.title}` : shareStatus === "error" ? "Could not copy the link" : ""}
        </span>
      </header>

      <section className="hero" aria-labelledby="artist-name">
        <h1 id="artist-name" className="artist-wordmark" aria-label="Nira Kova">
          <span className="wm one" aria-hidden="true">Nira</span>
          <span className="wm two" aria-hidden="true">Kova</span>
        </h1>
        <div className="hero-info">
          <p className="hero-track">{currentTrack.title} <span>&mdash; {currentTrack.tagline}</span></p>
          <p key={currentTrack.id} className="hero-line">{currentTrack.pullQuote}</p>
          <button className="enter" type="button" onClick={enter} aria-label={autoplayBlocked ? `Play shared song ${currentTrack.title}` : "Tap to experience Nira Kova"}>
            <span className="enter-ring"><i /></span>
            <span className="enter-copy">
              <b>{autoplayBlocked ? "Tap to play shared song" : "Tap to Experience"}</b>
              <small>{autoplayBlocked ? currentTrack.title : <>Sound on &middot; Headphones recommended</>}</small>
            </span>
          </button>
          <p className="follow">Follow for new songs &amp; the upcoming album</p>
          <nav className="social" aria-label="Nira Kova on social media">
            <a href="https://www.instagram.com/nirakovaofficial" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.3" cy="6.7" r="1.05" fill="currentColor" stroke="none" /></svg>
            </a>
            <a href="https://www.tiktok.com/@nirakova" target="_blank" rel="noopener noreferrer" aria-label="TikTok">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9.4 15.2a2.9 2.9 0 1 0 2.9 2.9V6.2c.6 1.9 2.1 3.3 4.1 3.6" /></svg>
            </a>
            <a href="https://www.youtube.com/@NiraKova" target="_blank" rel="noopener noreferrer" aria-label="YouTube">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="2.6" y="5.6" width="18.8" height="12.8" rx="4" /><path d="M10.3 9.3l5 2.7-5 2.7z" fill="currentColor" stroke="none" /></svg>
            </a>
            <a href="https://x.com/realnirakova" target="_blank" rel="noopener noreferrer" aria-label="X">
              <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
            </a>
            <a href="https://www.threads.net/@nirakovaofficial" target="_blank" rel="noopener noreferrer" aria-label="Threads">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20.5c-4 0-6.5-2.8-6.5-8.5S8 3.5 12 3.5c3 0 4.9 1.4 5.7 3.6M8.6 13.2c.3-1.6 1.6-2.6 3.4-2.6 2 0 3.3 1.1 3.3 2.7 0 1.9-1.7 2.9-3.4 2.9-1.5 0-2.4-.8-2.4-1.9 0-1.2 1.1-2 2.8-2 2.4 0 4.2 1.4 4.2 3.7" /></svg>
            </a>
            <a href="https://www.facebook.com/share/1Hu75VVAS8/" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
              <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M13.5 21v-7.5h2.4l.4-2.9h-2.8V8.7c0-.8.3-1.4 1.5-1.4h1.4V4.7c-.7-.1-1.5-.2-2.3-.2-2.3 0-3.8 1.4-3.8 3.9v2.2H8v2.9h2.3V21z" /></svg>
            </a>
          </nav>
          {started && (
            <p key={`${currentTrack.id}-${lyricIndex}`} className="lyric-cycle">
              {currentTrack.lyrics[lyricIndex].map((line, index) => (
                <span key={index}>
                  {index > 0 && <br />}
                  {line}
                </span>
              ))}
            </p>
          )}
        </div>
      </section>

      <section className="transport" aria-label="Audio player">
        <div className="transport-controls">
          <button className="play-toggle" type="button" onClick={togglePlayback} aria-label={playing ? "Pause" : "Play"}><span className={playing ? "pause-icon" : "play-icon"} /></button>
          <button className="skip-toggle" type="button" onClick={() => void goToNext()} aria-label={`Skip to ${TRACKS[trackIndex === TRACKS.length - 1 ? 0 : trackIndex + 1].title}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5v14l10-7z" fill="currentColor" stroke="none" /><rect x="16.5" y="5" width="2" height="14" fill="currentColor" /></svg>
          </button>
          <div className="timeline-wrap">
            <div className="track-row"><strong>{currentTrack.title}</strong><span>Nira Kova</span></div>
            <canvas ref={waveformRef} className="equalizer" aria-hidden="true" />
            <div className="time-row"><span>{formatTime(progress)}</span><span>{duration ? formatTime(duration) : "—:—"}</span></div>
            <input className="timeline" type="range" min="0" max={duration || 1} step="0.01" value={Math.min(progress, duration || 1)} aria-label="Track position" style={{ "--played": `${(progress / Math.max(duration, 1)) * 100}%` } as CSSProperties} onChange={(event) => {
              const next = Number(event.target.value);
              if (audioRef.current) audioRef.current.currentTime = next;
              setProgress(next);
            }} />
          </div>
          <button
            className={`repeat-toggle ${repeatMode !== "off" ? "is-on" : ""}`}
            type="button"
            aria-pressed={repeatMode !== "off"}
            aria-label={repeatMode === "off" ? "Enable repeat" : repeatMode === "all" ? "Repeat all is on — switch to repeat one" : "Repeat one is on — turn repeat off"}
            onClick={cycleRepeat}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" style={{ display: repeatMode === "one" ? "none" : "block" }}><path d="M4 7h11a4 4 0 0 1 4 4v1m-3-3 3 3-3 3M20 17H9a4 4 0 0 1-4-4v-1m3 3-3-3 3-3" /></svg>
            <svg viewBox="0 0 24 24" aria-hidden="true" style={{ display: repeatMode === "one" ? "block" : "none" }}><path d="M4 7h11a4 4 0 0 1 4 4v1m-3-3 3 3-3 3M20 17H9a4 4 0 0 1-4-4v-1m3 3-3-3 3-3" /><text x="12" y="15.3" textAnchor="middle" fontSize="8" fontWeight="800" fill="currentColor" stroke="none">1</text></svg>
          </button>
        </div>

        <ul className="playlist" aria-label="Playlist">
          {TRACKS.map((track, index) => {
            const isCurrent = index === trackIndex;
            return (
              <li key={track.id} className={`playlist-row ${isCurrent ? "is-current" : ""}`}>
                <button type="button" onClick={() => void playTrackAt(index)} aria-label={`${isCurrent && playing ? "Pause" : "Play"} ${track.title}`}>
                  <span className="playlist-index" aria-hidden="true">
                    {isCurrent && playing ? <i className="playing-dot" /> : String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="playlist-title">{track.title}{track.isNew && <b className="playlist-new">New</b>}</span>
                  <span className="playlist-duration">{trackDurations[index] ? formatTime(trackDurations[index]) : "—:—"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      <p className="mobile-hint">Drag to bend light &middot; Tap for impact</p>
    </main>
  );
}
