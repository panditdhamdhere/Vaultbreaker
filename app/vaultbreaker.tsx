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
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Vaultbreaker home"><span className="brand-mark">◆</span><span>VAULT<span className="brand-accent">BREAKER</span></span></a>
        <nav className="topnav" aria-label="Game navigation">
          <span className="mode-pill"><span className="status-dot" /> FREE PLAY</span>
          <a href="/testnet">Testnet status</a>
        </nav>
      </header>

      <main className="main-content">
        <section className="hero" aria-labelledby="game-title">
          <div className="hero-copy">
            <span className="eyebrow">THE SIX CHAMBER CHALLENGE</span>
            <h1 id="game-title">One more <em>door?</em></h1>
            <p>Choose a door. Grow your claim. Bank it when you’re ready—or risk everything in the next chamber.</p>
          </div>
          <div className="hero-rule" aria-label="Door outcomes">
            <span><b>1</b> TRAP</span>
            <span><b>1</b> CACHE</span>
            <span><b>1</b> RELIC</span>
          </div>
        </section>

        <div className="play-layout">
          <section className="vault-panel" aria-label="Vaultbreaker game">
            <div className="vault-head">
              <div><span className="section-kicker">CURRENT RUN</span><h2>{g.phase === 'ready' ? 'Enter the vault' : g.phase === 'choosing' ? 'Choose your door' : g.phase === 'revealing' ? 'Door revealed' : g.phase === 'busted' ? 'Run ended' : 'Claim secured'}</h2></div>
              <span className="chamber-count">CHAMBER <strong>{String(g.chamber).padStart(2, '0')} / 06</strong></span>
            </div>
            <div className="progress" aria-label={'Chamber ' + g.chamber + ' of six'}>{Array.from({ length: MAX }, (_, i) => <span key={i} className={i < g.chamber ? 'lit' : ''} />)}</div>

            <div className={'stage stage-' + g.phase}>
              <div className="stage-orbit" aria-hidden="true"><span>◆</span></div>
              {showDoors && <div className="doors">{[0, 1, 2].map(i => {
                const chosen = g.selected === i;
                const revealed = chosen && g.phase !== 'choosing' && g.log !== 'Opening vault door…';
                const outcome = g.doors[i];
                return <button key={i} className={'door ' + (chosen ? 'chosen ' : '') + (revealed ? outcome : '')} onClick={() => choose(i)} disabled={g.phase !== 'choosing'} aria-label={'Door ' + (i + 1) + (revealed ? ', ' + outcome : '')}><span className="door-number">DOOR {i + 1}</span><span className="door-symbol" aria-hidden="true">{revealed ? outcome === 'trap' ? '×' : outcome === 'relic' ? '✦' : '◆' : '◇'}</span><span className="door-label">{revealed ? outcome.toUpperCase() : 'OPEN'}</span></button>;
              })}</div>}
              {g.phase === 'ready' && <div className="center-action"><span className="center-icon" aria-hidden="true">◆</span><span className="center-kicker">YOUR RUN STARTS HERE</span><strong>How far will you go?</strong><p>One trap hides behind every set of doors.</p><button className="primary-button" onClick={start}>Enter the vault</button></div>}
              {(g.phase === 'busted' || g.phase === 'banked') && <div className="center-action result"><span className="center-icon" aria-hidden="true">{g.phase === 'busted' ? '×' : '✦'}</span><span className="center-kicker">{g.phase === 'busted' ? 'RUN OVER' : 'CLAIM SECURED'}</span><strong>{g.phase === 'busted' ? 'The trap got you.' : formatClaim(g.banked) + ' banked'}</strong><p>{g.phase === 'busted' ? 'Your unbanked claim was lost.' : 'Your best banked run is saved on this device.'}</p><button className="primary-button" onClick={start}>Play again</button></div>}
            </div>

            <div className="game-bottom" role="status" aria-live="polite"><span className="status-signal" aria-hidden="true" />{g.log}</div>
            {resolved && <div className="decision"><button className="primary-button" onClick={bank}>Bank {formatClaim(g.haul)}</button><button className="secondary-button" onClick={continueRun}>Go deeper</button></div>}
          </section>

          <aside className="intel-panel" aria-label="Run information">
            <div className="claim-card"><span className="section-kicker">UNBANKED CLAIM</span><strong>{formatClaim(g.haul)}</strong><p>Virtual multiplier at risk</p><span className="claim-glow" aria-hidden="true" /></div>
            <div className="intel-card"><span className="section-kicker">THE PAYOUTS</span><div className="payout-row"><span className="outcome-icon cache-icon">◆</span><span>Cache<small>Safe door</small></span><strong>1.10×</strong></div><div className="payout-row"><span className="outcome-icon relic-icon">✦</span><span>Relic<small>Safe door</small></span><strong>1.50×</strong></div><div className="payout-row"><span className="outcome-icon trap-icon">×</span><span>Trap<small>Run ends</small></span><strong>0×</strong></div></div>
            <div className="intel-card best-card"><span className="section-kicker">PERSONAL BEST</span><strong>{formatClaim(g.best)}</strong><p>Best banked run on this device</p></div>
          </aside>
        </div>

        <section className="rules-strip" aria-label="How the game works"><div><span>01</span><strong>Choose</strong><p>Pick one of three doors.</p></div><div><span>02</span><strong>Reveal</strong><p>Find a cache, relic, or trap.</p></div><div><span>03</span><strong>Decide</strong><p>Bank your claim or continue.</p></div></section>
      </main>
      <footer className="site-footer"><span>FREE-PLAY DEMO · VIRTUAL MULTIPLIERS ONLY · NO ENTRY FEE OR PAYOUT · BROWSER RANDOMNESS</span><a href="/testnet">View testnet status</a></footer>
    </div>
  );
}
