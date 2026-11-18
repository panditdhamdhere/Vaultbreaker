'use client';
import { useEffect, useState } from 'react';

type Phase = 'ready' | 'choosing' | 'revealing' | 'busted' | 'banked';
type Door = 'trap' | 'cache' | 'relic';
type Run = { phase: Phase; chamber: number; haul: number; banked: number; best: number; selected: number | null; doors: Door[]; log: string };
const MAX = 6;
const VIRTUAL_ENTRY = 1_000_000;
const BEST_KEY = 'vaultbreakerBestMultiplierV2';
const formatClaim = (credits: number) => `${(credits / VIRTUAL_ENTRY).toLocaleString(undefined, { maximumFractionDigits: 6 })}×`;
const base = (best = 0): Run => ({ phase: 'ready', chamber: 1, haul: 0, banked: 0, best, selected: null, doors: [], log: 'The vault is waiting.' });
const random = (limit: number) => { const x = new Uint32Array(1); crypto.getRandomValues(x); return x[0] % limit; };
function makeDoors(): Door[] { const trap = random(3); const relic = (trap + 1 + random(2)) % 3; return [0, 1, 2].map(i => i === trap ? 'trap' : i === relic ? 'relic' : 'cache'); }

export default function Game() {
  const [g, setG] = useState<Run>(() => base());
  useEffect(() => { setG(v => ({ ...v, best: Number(localStorage.getItem(BEST_KEY) || 0) })); }, []);
  const start = () => setG(v => ({ ...base(v.best), phase: 'choosing', haul: VIRTUAL_ENTRY, doors: makeDoors(), log: 'Pick a door. One trap, one cache, one relic.' }));
  const choose = (index: number) => {
    if (g.phase !== 'choosing') return;
    setG(v => ({ ...v, phase: 'revealing', selected: index, log: 'Opening vault door…' }));
    window.setTimeout(() => setG(v => {
      if (v.phase !== 'revealing' || v.selected !== index) return v;
      const outcome = v.doors[index];
      if (outcome === 'trap') return { ...v, phase: 'busted', haul: 0, log: 'TRAP! This run’s unbanked claim is gone.' };
      const haul = Math.floor(v.haul * (outcome === 'relic' ? 15_000 : 11_000) / 10_000);
      if (v.chamber === MAX) {
        const best = Math.max(v.best, haul); localStorage.setItem(BEST_KEY, String(best));
        return { ...v, phase: 'banked', haul: 0, banked: haul, best, log: 'VAULT CLEARED. Full claim secured.' };
      }
      return { ...v, phase: 'revealing', haul, log: outcome === 'relic' ? 'RELIC! Claim multiplied by 1.50×. Bank or go deeper.' : 'CACHE! Claim multiplied by 1.10×. Bank or go deeper.' };
    }), 650);
  };
  const continueRun = () => setG(v => v.phase === 'revealing' && v.selected !== null ? { ...v, phase: 'choosing', chamber: v.chamber + 1, doors: makeDoors(), selected: null, log: 'Deeper chamber. Same odds. Your claim is at risk.' } : v);
  const bank = () => setG(v => {
    if (v.phase !== 'revealing' || v.selected === null) return v;
    const best = Math.max(v.best, v.haul); localStorage.setItem(BEST_KEY, String(best));
    return { ...v, phase: 'banked', banked: v.haul, haul: 0, best, log: 'CLAIM BANKED. Run complete.' };
  });
  const resolved = g.phase === 'revealing' && g.selected !== null && g.log !== 'Opening vault door…';
  const showDoors = g.phase === 'choosing' || g.phase === 'revealing' || g.phase === 'busted' || g.phase === 'banked' && g.doors.length > 0;
  return <div className="shell">
    <header className="header"><div className="brand"><span className="brand-icon">◆</span> VAULT<span>BREAKER</span></div><div className="nav-status"><i/> FREE PLAY <span>EARLY ACCESS</span></div></header>
    <main className="layout">
      <section className="intro"><div className="eyebrow">RISK. REVEAL. REPEAT.</div><h1>One more<br/><em>door?</em></h1><p>Six chambers. Three doors each: a trap, a cache, and a relic. Bank your claim or risk it in the next chamber.</p><div className="steps"><div><b>01</b><span>CHOOSE</span><small>Pick one of three doors</small></div><div><b>02</b><span>REVEAL</span><small>Cache 1.10× · Relic 1.50×</small></div><div><b>03</b><span>DECIDE</span><small>Bank it or risk it</small></div></div><div className="notice"><strong>FREE-PLAY RULES</strong><p>Start at 1.00×. Safe doors multiply your claim; a trap ends the run. This demo uses browser randomness and awards no tokens.</p></div></section>
      <section className="game"><div className="game-top"><span><i/> {g.phase === 'ready' ? 'VAULT CLOSED' : g.phase === 'choosing' ? 'CHOOSE YOUR DOOR' : g.phase === 'revealing' ? 'VAULT REVEAL' : g.phase === 'busted' ? 'RUN ENDED' : 'CLAIM SECURED'}</span><b>CHAMBER {String(g.chamber).padStart(2, '0')} / 06</b></div><div className="progress">{Array.from({ length: MAX }, (_, i) => <span key={i} className={i < g.chamber ? 'lit' : ''}/>)}</div>
        <div className="stage"><div className="glow"/><div className="arch"><span>◈</span><strong>THE VAULT</strong><small>{g.phase === 'ready' ? 'PRESS ENTER TO BEGIN' : 'CHOOSE WISELY'}</small></div>
          {showDoors && <div className="doors">{[0, 1, 2].map(i => {
            const chosen = g.selected === i; const revealed = chosen && g.phase !== 'choosing' && g.log !== 'Opening vault door…';
            return <button key={i} className={'door ' + (chosen ? 'chosen ' : '') + (revealed ? g.doors[i] : '')} onClick={() => choose(i)} disabled={g.phase !== 'choosing'} aria-label={'Door ' + (i + 1)}><span className="door-number">0{i + 1}</span><span className="door-symbol">{revealed ? g.doors[i] === 'trap' ? '✕' : g.doors[i] === 'relic' ? '✦' : '◆' : '◇'}</span><span className="door-label">{revealed ? g.doors[i].toUpperCase() : 'OPEN'}</span></button>;
          })}</div>}
          {g.phase === 'ready' && <div className="center-action"><button onClick={start}>ENTER THE VAULT <span>↗</span></button></div>}
          {(g.phase === 'busted' || g.phase === 'banked') && <div className="center-action result"><strong>{g.phase === 'busted' ? 'BUSTED' : 'SECURED'}</strong><span>{g.phase === 'banked' ? formatClaim(g.banked) + ' CLAIM' : 'YOUR UNBANKED CLAIM WAS LOST'}</span><button onClick={start}>PLAY AGAIN <span>↗</span></button></div>}
        </div><div className="game-bottom"><span>{g.log}</span></div>
        {resolved && <div className="decision"><button className="bank" onClick={bank}>BANK {formatClaim(g.haul)} CLAIM</button><button className="push" onClick={continueRun}>GO DEEPER <span>→</span></button></div>}
      </section>
      <aside className="stats"><div className="stat main-stat"><span>UNBANKED CLAIM</span><strong>{formatClaim(g.haul)}</strong><small>VIRTUAL MULTIPLIER AT RISK</small></div><div className="stat"><span>SAFE DOORS</span><strong>1.10×<small> CACHE</small></strong><div>RELIC MULTIPLIES BY <b>1.50×</b></div></div><div className="stat"><span>BEST BANKED RUN</span><strong>{formatClaim(g.best)}</strong><div>STORED ON THIS DEVICE</div></div><div className="odds"><b>THE ODDS</b><div><span>SAFE DOOR</span><strong>2 IN 3</strong></div><div><span>TRAP DOOR</span><strong>1 IN 3</strong></div><p>Each chamber has one trap, one cache, and one relic. Outcomes in this demo use browser randomness.</p></div></aside>
    </main><footer>FREE-PLAY GAME DEMO · VIRTUAL MULTIPLIERS ONLY · NO WALLET, ENTRY FEE OR PAYOUT · RESULTS ARE NOT ON-CHAIN VERIFIED. <a href="/testnet" style={{ color: '#e5bd78', marginLeft: 12 }}>TESTNET STATUS →</a></footer>
  </div>;
}
