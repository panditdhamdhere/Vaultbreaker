'use client';
import { useEffect, useState } from 'react';

type Phase = 'ready' | 'choosing' | 'revealing' | 'busted' | 'banked';
type Door = 'trap' | 'cache' | 'relic';
type Run = { phase: Phase; chamber: number; haul: number; banked: number; best: number; scanner: number; scanned: number | null; selected: number | null; doors: Door[]; log: string; streak: number };
const MAX = 6;
const base = (best = 0): Run => ({ phase: 'ready', chamber: 1, haul: 0, banked: 0, best, scanner: 1, scanned: null, selected: null, doors: [], log: 'The vault is waiting.', streak: 0 });
const random = (limit: number) => { const x = new Uint32Array(1); crypto.getRandomValues(x); return x[0] % limit; };
function makeDoors(): Door[] { const trap = random(3); const relic = (trap + 1 + random(2)) % 3; return [0, 1, 2].map(i => i === trap ? 'trap' : i === relic ? 'relic' : 'cache'); }
const rewards = [100, 180, 280, 420, 650, 1000];

export default function Game() {
  const [g, setG] = useState<Run>(() => base());
  useEffect(() => { setG(v => ({ ...v, best: Number(localStorage.getItem('vaultbreakerBest') || 0) })); }, []);
  const start = () => setG(v => ({ ...base(v.best), phase: 'choosing', doors: makeDoors(), log: 'Pick a door. Two are safe. One is a trap.' }));
  const scan = () => setG(v => {
    if (v.phase !== 'choosing' || v.scanner === 0 || v.scanned !== null) return v;
    return { ...v, scanner: 0, scanned: v.doors.indexOf('trap'), log: 'Scanner used. The trap is exposed.' };
  });
  const choose = (index: number) => {
    if (g.phase !== 'choosing') return;
    setG(v => ({ ...v, phase: 'revealing', selected: index, log: 'Opening vault door…' }));
    window.setTimeout(() => setG(v => {
      if (v.phase !== 'revealing' || v.selected !== index) return v;
      const outcome = v.doors[index];
      if (outcome === 'trap') return { ...v, phase: 'busted', haul: 0, streak: 0, log: 'TRAP! This run’s unbanked haul is gone.' };
      const amount = rewards[v.chamber - 1] * (outcome === 'relic' ? 2 : 1);
      const haul = v.haul + amount;
      if (v.chamber === MAX) {
        const best = Math.max(v.best, haul); localStorage.setItem('vaultbreakerBest', String(best));
        return { ...v, phase: 'banked', haul: 0, banked: haul, best, streak: v.streak + 1, log: 'VAULT CLEARED. Full haul secured.' };
      }
      return { ...v, phase: 'revealing', haul, streak: v.streak + 1, log: outcome === 'relic' ? 'RELIC! Double chamber reward. Bank or go deeper.' : 'SAFE. Bank or go deeper.' };
    }), 650);
  };
  const continueRun = () => setG(v => v.phase === 'revealing' && v.selected !== null ? { ...v, phase: 'choosing', chamber: v.chamber + 1, doors: makeDoors(), scanned: null, selected: null, log: 'Deeper chamber. Bigger rewards. Same odds.' } : v);
  const bank = () => setG(v => {
    if (v.phase !== 'revealing' || v.selected === null) return v;
    const best = Math.max(v.best, v.haul); localStorage.setItem('vaultbreakerBest', String(best));
    return { ...v, phase: 'banked', banked: v.haul, haul: 0, best, log: 'HAUL BANKED. Smart exit.' };
  });
  const resolved = g.phase === 'revealing' && g.selected !== null && g.log !== 'Opening vault door…';
  const showDoors = g.phase === 'choosing' || g.phase === 'revealing' || g.phase === 'busted' || g.phase === 'banked' && g.doors.length > 0;
  return <div className="shell">
    <header className="header"><div className="brand"><span className="brand-icon">◆</span> VAULT<span>BREAKER</span></div><div className="nav-status"><i/> FREE PLAY <span>EARLY ACCESS</span></div></header>
    <main className="layout">
      <section className="intro"><div className="eyebrow">RISK. REVEAL. REPEAT.</div><h1>One more<br/><em>door?</em></h1><p>Six chambers. Three doors each. Two safe, one trap. Take your haul or push deeper for bigger rewards.</p><div className="steps"><div><b>01</b><span>CHOOSE</span><small>Pick one of three doors</small></div><div><b>02</b><span>REVEAL</span><small>Find a cache or relic</small></div><div><b>03</b><span>DECIDE</span><small>Bank it or risk it</small></div></div><div className="notice"><strong>THE SCANNER</strong><p>Expose one trap door once per run. Save it for a deeper chamber, or spend it early to protect a growing haul.</p></div></section>
      <section className="game"><div className="game-top"><span><i/> {g.phase === 'ready' ? 'VAULT CLOSED' : g.phase === 'choosing' ? 'CHOOSE YOUR DOOR' : g.phase === 'revealing' ? 'VAULT REVEAL' : g.phase === 'busted' ? 'RUN ENDED' : 'HAUL SECURED'}</span><b>CHAMBER {String(g.chamber).padStart(2, '0')} / 06</b></div><div className="progress">{Array.from({ length: MAX }, (_, i) => <span key={i} className={i < g.chamber ? 'lit' : ''}/>)}</div>
        <div className="stage"><div className="glow"/><div className="arch"><span>◈</span><strong>THE VAULT</strong><small>{g.phase === 'ready' ? 'PRESS ENTER TO BEGIN' : 'CHOOSE WISELY'}</small></div>
          {showDoors && <div className="doors">{[0, 1, 2].map(i => {
            const chosen = g.selected === i; const revealed = chosen && g.phase !== 'choosing' && g.log !== 'Opening vault door…';
            const trapSeen = g.scanned === i && g.phase === 'choosing';
            return <button key={i} className={'door ' + (chosen ? 'chosen ' : '') + (revealed ? g.doors[i] : '') + (trapSeen ? ' scanned' : '')} onClick={() => choose(i)} disabled={g.phase !== 'choosing'} aria-label={'Door ' + (i + 1) + (trapSeen ? ', trap detected' : '')}><span className="door-number">0{i + 1}</span><span className="door-symbol">{revealed ? g.doors[i] === 'trap' ? '✕' : g.doors[i] === 'relic' ? '✦' : '◆' : trapSeen ? '✕' : '◇'}</span><span className="door-label">{revealed ? g.doors[i].toUpperCase() : trapSeen ? 'TRAP' : 'OPEN'}</span></button>;
          })}</div>}
          {g.phase === 'ready' && <div className="center-action"><button onClick={start}>ENTER THE VAULT <span>↗</span></button></div>}
          {(g.phase === 'busted' || g.phase === 'banked') && <div className="center-action result"><strong>{g.phase === 'busted' ? 'BUSTED' : 'SECURED'}</strong><span>{g.phase === 'banked' ? g.banked.toLocaleString() + ' POINTS' : 'YOUR HAUL WAS LOST'}</span><button onClick={start}>PLAY AGAIN <span>↗</span></button></div>}
        </div><div className="game-bottom"><span>{g.log}</span>{g.phase === 'choosing' && <button onClick={scan} disabled={g.scanner === 0}>SCAN TRAP <b>{g.scanner} LEFT</b></button>}</div>
        {resolved && <div className="decision"><button className="bank" onClick={bank}>BANK {g.haul.toLocaleString()} POINTS</button><button className="push" onClick={continueRun}>GO DEEPER <span>→</span></button></div>}
      </section>
      <aside className="stats"><div className="stat main-stat"><span>UNBANKED HAUL</span><strong>{g.haul.toLocaleString()}</strong><small>POINTS AT RISK</small></div><div className="stat"><span>CHAMBER REWARD</span><strong>{rewards[g.chamber - 1].toLocaleString()}<small> BASE</small></strong><div>RELIC FINDS PAY <b>2×</b></div></div><div className="stat"><span>BEST BANKED RUN</span><strong>{g.best.toLocaleString()}</strong><div>STORED ON THIS DEVICE</div></div><div className="odds"><b>THE ODDS</b><div><span>SAFE DOOR</span><strong>2 IN 3</strong></div><div><span>TRAP DOOR</span><strong>1 IN 3</strong></div><p>Each chamber generates a fresh set of doors. The scanner reveals the trap once per run.</p></div></aside>
    </main><footer>FREE-PLAY GAME DEMO · NO WALLET, ENTRY FEE OR PAYOUT · RESULTS USE BROWSER RANDOMNESS AND ARE NOT ON-CHAIN VERIFIED. <a href="/testnet" style={{ color: '#e5bd78', marginLeft: 12 }}>TESTNET STATUS →</a></footer>
  </div>;
}
