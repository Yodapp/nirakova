"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

type Ripple = { x: number; y: number; life: number };
type Particle = { a: number; r: number; speed: number; size: number; drift: number };

const TRACK_LENGTH = 294.72;

function formatTime(value: number) {
  const safe = Number.isFinite(value) ? value : 0;
  return `${Math.floor(safe / 60)}:${Math.floor(safe % 60).toString().padStart(2, "0")}`;
}

export default function Experience() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const pointerRef = useRef({ x: 0.5, y: 0.5, active: false });
  const ripplesRef = useRef<Ripple[]>([]);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(TRACK_LENGTH);

  const primeAudio = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audioContextRef.current) {
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.82;
      const source = context.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(context.destination);
      audioContextRef.current = context;
      analyserRef.current = analyser;
    }
    await audioContextRef.current.resume();
  }, []);

  const enter = useCallback(async () => {
    try {
      await primeAudio();
      await audioRef.current?.play();
      setPlaying(true);
    } finally {
      setStarted(true);
    }
  }, [primeAudio]);

  const togglePlayback = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      await primeAudio();
      await audio.play();
    } else {
      audio.pause();
    }
  }, [primeAudio]);

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    pointerRef.current = {
      x: event.clientX / window.innerWidth,
      y: event.clientY / window.innerHeight,
      active: true,
    };
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const update = () => setProgress(audio.currentTime || 0);
    const loaded = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : TRACK_LENGTH);
    const played = () => setPlaying(true);
    const paused = () => setPlaying(false);
    audio.addEventListener("timeupdate", update);
    audio.addEventListener("loadedmetadata", loaded);
    audio.addEventListener("play", played);
    audio.addEventListener("pause", paused);
    audio.addEventListener("ended", paused);
    return () => {
      audio.removeEventListener("timeupdate", update);
      audio.removeEventListener("loadedmetadata", loaded);
      audio.removeEventListener("play", played);
      audio.removeEventListener("pause", paused);
      audio.removeEventListener("ended", paused);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    let frame = 0;
    let width = window.innerWidth;
    let height = window.innerHeight;
    let smoothBass = 0;
    let smoothMid = 0;
    let smoothHigh = 0;
    let last = performance.now();
    const particles: Particle[] = Array.from({ length: 130 }, (_, index) => ({
      a: (index / 130) * Math.PI * 2 + Math.random() * 0.18,
      r: 105 + Math.random() * Math.min(width, height) * 0.38,
      speed: 0.00004 + Math.random() * 0.00012,
      size: 0.35 + Math.random() * 1.65,
      drift: Math.random() * Math.PI * 2,
    }));

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const average = (data: Uint8Array<ArrayBuffer>, from: number, to: number) => {
      let total = 0;
      const end = Math.min(to, data.length);
      for (let index = from; index < end; index += 1) total += data[index];
      return total / Math.max(1, end - from) / 255;
    };

    const draw = (now: number) => {
      const delta = Math.min(now - last, 40);
      last = now;
      const analyser = analyserRef.current;
      const audio = audioRef.current;
      let bass = 0.035 + Math.sin(now * 0.0017) * 0.012;
      let mid = 0.025;
      let high = 0.02;
      let data: Uint8Array<ArrayBuffer> | null = null;
      if (analyser && started && audio && !audio.paused) {
        data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        bass = average(data, 1, 15);
        mid = average(data, 16, 90);
        high = average(data, 91, 255);
      }
      smoothBass += (bass - smoothBass) * (bass > smoothBass ? 0.36 : 0.09);
      smoothMid += (mid - smoothMid) * 0.12;
      smoothHigh += (high - smoothHigh) * 0.16;

      const pointer = pointerRef.current;
      const px = pointer.x * width;
      const py = pointer.y * height;
      const centerX = width * (width < 760 ? 0.56 : 0.69) + (px - width / 2) * 0.035;
      const centerY = height * 0.46 + (py - height / 2) * 0.035;
      const root = document.documentElement.style;
      root.setProperty("--bass", smoothBass.toFixed(3));
      root.setProperty("--mid", smoothMid.toFixed(3));
      root.setProperty("--high", smoothHigh.toFixed(3));
      root.setProperty("--pointer-x", `${(pointer.x * 100).toFixed(2)}%`);
      root.setProperty("--pointer-y", `${(pointer.y * 100).toFixed(2)}%`);
      root.setProperty("--tilt-x", `${((pointer.y - 0.5) * -5).toFixed(2)}deg`);
      root.setProperty("--tilt-y", `${((pointer.x - 0.5) * 7).toFixed(2)}deg`);

      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";
      const glow = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, 170 + smoothBass * 280);
      glow.addColorStop(0, `rgba(255,51,82,${0.025 + smoothBass * 0.18})`);
      glow.addColorStop(0.25, `rgba(195,14,46,${0.018 + smoothBass * 0.11})`);
      glow.addColorStop(1, "rgba(80,0,18,0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      for (let ring = 0; ring < 5; ring += 1) {
        context.beginPath();
        context.arc(centerX, centerY, 100 + ring * 49 + smoothBass * (50 + ring * 13), -Math.PI * 0.92, Math.PI * 0.92);
        context.lineWidth = ring === 0 ? 1.3 + smoothBass * 3 : 0.45;
        context.strokeStyle = `rgba(239,49,80,${Math.max(0.035, 0.2 - ring * 0.032 + smoothBass * 0.22)})`;
        context.stroke();
      }

      if (data) {
        const bars = width < 700 ? 72 : 118;
        for (let index = 0; index < bars; index += 1) {
          const value = data[3 + Math.floor((index / bars) * 160)] / 255;
          const angle = (index / bars) * Math.PI * 2 - Math.PI / 2;
          const base = 116 + smoothBass * 35;
          context.beginPath();
          context.moveTo(centerX + Math.cos(angle) * base, centerY + Math.sin(angle) * base);
          context.lineTo(centerX + Math.cos(angle) * (base + 4 + value * 72), centerY + Math.sin(angle) * (base + 4 + value * 72));
          context.lineWidth = 0.45 + value * 1.5;
          context.strokeStyle = `rgba(255,${35 + value * 50},${62 + value * 55},${0.08 + value * 0.48})`;
          context.stroke();
        }
      }

      for (const particle of particles) {
        particle.a += particle.speed * delta * (1 + smoothMid * 3);
        const radius = particle.r + Math.sin(now * 0.00045 + particle.drift) * 7 + smoothBass * 54;
        let x = centerX + Math.cos(particle.a) * radius;
        let y = centerY + Math.sin(particle.a) * radius * 0.64;
        const dx = x - px;
        const dy = y - py;
        const distance = Math.hypot(dx, dy);
        if (pointer.active && distance < 130) {
          const force = (130 - distance) / 130;
          x += (dx / Math.max(distance, 1)) * force * 26;
          y += (dy / Math.max(distance, 1)) * force * 26;
        }
        context.beginPath();
        context.arc(x, y, particle.size * (1 + smoothHigh * 1.8), 0, Math.PI * 2);
        context.fillStyle = `rgba(248,${80 + smoothMid * 100},${105 + smoothHigh * 120},${0.14 + smoothHigh * 0.42})`;
        context.fill();
      }

      ripplesRef.current = ripplesRef.current.filter((ripple) => {
        ripple.life -= 0.018;
        if (ripple.life <= 0) return false;
        context.beginPath();
        context.arc(ripple.x, ripple.y, (1 - ripple.life) * (170 + smoothBass * 180), 0, Math.PI * 2);
        context.strokeStyle = `rgba(255,54,88,${ripple.life * 0.5})`;
        context.lineWidth = 0.7 + ripple.life * 2.2;
        context.stroke();
        return true;
      });
      context.globalCompositeOperation = "source-over";
      frame = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, [started]);

  return (
    <main
      className={`experience ${started ? "is-started" : "is-dormant"} ${playing ? "is-playing" : "is-paused"}`}
      onPointerMove={onPointerMove}
      onPointerLeave={() => { pointerRef.current.active = false; }}
      onPointerDown={(event) => {
        if (started) ripplesRef.current.push({ x: event.clientX, y: event.clientY, life: 1 });
      }}
    >
      <audio ref={audioRef} src="/nira-kova.mp3" preload="metadata" playsInline />
      <div className="wide-memory" aria-hidden="true" />
      <div className="portrait portrait-base" aria-hidden="true" />
      <div className="portrait portrait-red" aria-hidden="true" />
      <div className="portrait portrait-blue" aria-hidden="true" />
      <div className="portrait-shade" aria-hidden="true" />
      <div className="pointer-aura" aria-hidden="true" />
      <canvas ref={canvasRef} className="signal-canvas" aria-hidden="true" />
      <div className="scanlines" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
      <div className="bass-flash" aria-hidden="true" />

      <header className="topbar">
        <div className="monogram" aria-label="Nira Kova">NK</div>
        <div className="signal-status"><span className="live-dot" /><span>{started ? (playing ? "Live signal" : "Signal held") : "System dormant"}</span><b>48.1 kHz</b></div>
      </header>

      <div className="edge-copy edge-left" aria-hidden="true">Immersive audio / 001</div>
      <div className="edge-copy edge-right" aria-hidden="true">Move · touch · feel</div>
      <div className="corner corner-tl" aria-hidden="true" /><div className="corner corner-tr" aria-hidden="true" />
      <div className="corner corner-bl" aria-hidden="true" /><div className="corner corner-br" aria-hidden="true" />

      <section className="hero" aria-labelledby="artist-name">
        <p className="eyebrow"><span /> Enter the frequency</p>
        <h1 id="artist-name" aria-label="Nira Kova"><span className="name-line">Nira</span><span className="name-line name-indent">Kova</span></h1>
        <button className="enter" type="button" onClick={enter} aria-label="Start the Nira Kova experience">
          <span className="enter-ring"><i /></span>
          <span className="enter-copy"><b>Touch to awaken</b><small>Sound on · Headphones recommended</small></span>
        </button>
      </section>

      <div className="stage-copy" aria-hidden={!started}><p>Audio becomes matter</p><span>Move to bend the field<br />Tap to release energy</span></div>
      <div className="bass-meter" aria-hidden="true"><span>Bass pressure</span><i /><i /><i /><i /><i /><i /><i /><i /></div>

      <section className="transport" aria-label="Audio controls">
        <button className="play-toggle" type="button" onClick={togglePlayback} aria-label={playing ? "Pause" : "Play"}><span className={playing ? "pause-icon" : "play-icon"} /></button>
        <div className="timeline-wrap">
          <div className="time-row"><span>{formatTime(progress)}</span><span>{formatTime(duration)}</span></div>
          <input className="timeline" type="range" min="0" max={duration || TRACK_LENGTH} step="0.01" value={Math.min(progress, duration || TRACK_LENGTH)} aria-label="Track position" style={{ "--played": `${(progress / Math.max(duration, 1)) * 100}%` } as CSSProperties} onChange={(event) => { const next = Number(event.target.value); if (audioRef.current) audioRef.current.currentTime = next; setProgress(next); }} />
        </div>
        <button className={`mute ${muted ? "is-muted" : ""}`} type="button" aria-label={muted ? "Unmute" : "Mute"} onClick={() => { const next = !muted; setMuted(next); if (audioRef.current) audioRef.current.muted = next; }}><span /><i /><i /></button>
      </section>
      <p className="mobile-hint">Drag to bend light · Tap for impact</p>
    </main>
  );
}
