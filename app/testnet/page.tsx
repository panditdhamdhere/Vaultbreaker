'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPublicClient, createWalletClient, custom, defineChain, formatUnits, http, isAddress, keccak256, parseAbi, parseEventLogs, type Address } from 'viem';

const address = process.env.NEXT_PUBLIC_VAULTBREAKER_ADDRESS;
const expectedCodeHash = process.env.NEXT_PUBLIC_VAULTBREAKER_CODE_HASH;
const rpc = process.env.NEXT_PUBLIC_RH_TESTNET_RPC || 'https://rpc.testnet.chain.robinhood.com';
const chain = defineChain({ id: 46630, name: 'Robinhood Testnet', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const gameAbi = parseAbi([
  'function entryAmount() view returns (uint256)',
  'function token() view returns (address)',
  'function registry() view returns (address)',
  'function paused() view returns (bool)',
  'function runs(uint256) view returns (address player, uint64 round, uint8 stage, uint8 choice, uint128 credits, bool active, bool awaiting)',
  'function start(uint8 choice) returns (uint256)',
  'function advance(uint256 runId, uint8 choice)',
  'function resolve(uint256 runId, bytes signature) returns (uint8)',
  'function cashOut(uint256 runId)',
  'event RunStarted(uint256 indexed runId, address indexed player, uint64 round, uint8 choice)',
]);
const tokenAbi = parseAbi([
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function claimFaucet()',
  'function balanceOf(address owner) view returns (uint256)',
]);
const registryAbi = parseAbi(['function hasSig(uint64 round) view returns (bool)']);
type RunView = { round: bigint; stage: number; credits: bigint; active: boolean; awaiting: boolean };
type InjectedProvider = Parameters<typeof custom>[0] & { on?: (event: string, listener: () => void) => void; removeListener?: (event: string, listener: () => void) => void };
const publicClient = createPublicClient({ chain, transport: http(rpc) });
const runKey = (account: Address, game: Address) => `vaultbreakerRun:${chain.id}:${game.toLowerCase()}:${account.toLowerCase()}`;
function walletClient() {
  const provider = typeof window !== 'undefined' && 'ethereum' in window ? (window as Window & { ethereum: InjectedProvider }).ethereum : undefined;
  return provider ? createWalletClient({ chain, transport: custom(provider) }) : null;
}
async function confirmed(hash: `0x${string}`) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`Transaction reverted: ${hash}`);
  return receipt;
}

export default function TestnetPage() {
  const [wallet, setWallet] = useState<Address>();
  const [token, setToken] = useState<Address>();
  const [entry, setEntry] = useState<bigint>();
  const [decimals, setDecimals] = useState(18);
  const [symbol, setSymbol] = useState('TOKEN');
  const [balance, setBalance] = useState<bigint>();
  const [paused, setPaused] = useState(false);
  const [runId, setRunId] = useState<bigint>();
  const [run, setRun] = useState<RunView>();
  const [recoveryId, setRecoveryId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Connect a wallet to inspect a configured testnet game.');
  const sessionEpoch = useRef(0);
  const configured = !!address && isAddress(address) && /^0x[0-9a-fA-F]{64}$/.test(expectedCodeHash || '');
  const game = address as Address;
  useEffect(() => {
    const provider = typeof window !== 'undefined' && 'ethereum' in window ? (window as Window & { ethereum: InjectedProvider }).ethereum : undefined;
    if (!provider?.on || !provider.removeListener) return;
    const reset = () => { sessionEpoch.current++; setWallet(undefined); setToken(undefined); setRunId(undefined); setRun(undefined); setBalance(undefined); setPaused(false); setMessage('Wallet account or network changed. Reconnect to continue.'); };
    provider.on('accountsChanged', reset);
    provider.on('chainChanged', reset);
    return () => { provider.removeListener?.('accountsChanged', reset); provider.removeListener?.('chainChanged', reset); };
  }, []);

  const refresh = useCallback(async (id: bigint, epoch = sessionEpoch.current) => {
    const result = await publicClient.readContract({ address: game, abi: gameAbi, functionName: 'runs', args: [id] });
    const next = { round: result[1], stage: result[2], credits: result[4], active: result[5], awaiting: result[6] };
    if (epoch === sessionEpoch.current) setRun(next);
    return next;
  }, [game]);

  async function connect() {
    const client = walletClient();
    if (!client || !configured) { setMessage('Install an EVM wallet and configure the game contract first.'); return; }
    try {
      setBusy(true);
      setWallet(undefined); setRunId(undefined); setRun(undefined);
      if (await publicClient.getChainId() !== chain.id) throw new Error('Configured RPC is not Robinhood Testnet.');
      const code = await publicClient.getCode({ address: game });
      if (!code || code === '0x') throw new Error('Game contract is not deployed at the configured address.');
      if (keccak256(code).toLowerCase() !== expectedCodeHash!.toLowerCase()) throw new Error('Game runtime code hash does not match the verified deployment.');
      const [account] = await client.requestAddresses();
      if (!account) throw new Error('Wallet returned no account.');
      await client.switchChain({ id: chain.id });
      const [activeAccount] = await client.getAddresses();
      if (activeAccount?.toLowerCase() !== account.toLowerCase()) throw new Error('Wallet account changed during connection. Reconnect.');
      const epoch = sessionEpoch.current;
      const asset = await publicClient.readContract({ address: game, abi: gameAbi, functionName: 'token' });
      const [amount, d, s, isPaused] = await Promise.all([
        publicClient.readContract({ address: game, abi: gameAbi, functionName: 'entryAmount' }),
        publicClient.readContract({ address: asset, abi: tokenAbi, functionName: 'decimals' }),
        publicClient.readContract({ address: asset, abi: tokenAbi, functionName: 'symbol' }),
        publicClient.readContract({ address: game, abi: gameAbi, functionName: 'paused' }),
      ]);
      const nextBalance = await publicClient.readContract({ address: asset, abi: tokenAbi, functionName: 'balanceOf', args: [account] });
      if (epoch !== sessionEpoch.current) return;
      setWallet(account); setToken(asset); setEntry(amount); setDecimals(d); setSymbol(s); setBalance(nextBalance); setPaused(isPaused);
      const saved = localStorage.getItem(runKey(account, game));
      if (saved) {
        const id = BigInt(saved);
        const existing = await publicClient.readContract({ address: game, abi: gameAbi, functionName: 'runs', args: [id] });
        if (epoch !== sessionEpoch.current) return;
        if (existing[0].toLowerCase() === account.toLowerCase() && existing[5]) {
          setRunId(id); await refresh(id, epoch);
          if (epoch !== sessionEpoch.current) return;
          setMessage('Active run restored from the contract.');
        } else { localStorage.removeItem(runKey(account, game)); setMessage('Connected. Choose one of three doors to lock a future beacon.'); }
      } else setMessage('Connected. Choose one of three doors to lock a future beacon.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Wallet connection failed.'); }
    finally { setBusy(false); }
  }

  async function recoverRun() {
    if (!wallet || !configured) return;
    try {
      setBusy(true);
      const epoch = sessionEpoch.current;
      const id = BigInt(recoveryId.trim());
      if (id <= 0n) throw new Error('Enter a valid run ID.');
      const existing = await publicClient.readContract({ address: game, abi: gameAbi, functionName: 'runs', args: [id] });
      if (epoch !== sessionEpoch.current) return;
      if (existing[0].toLowerCase() !== wallet.toLowerCase()) throw new Error('This run does not belong to the connected wallet.');
      if (!existing[5]) throw new Error('This run is already closed.');
      setRunId(id); await refresh(id, epoch);
      if (epoch !== sessionEpoch.current) return;
      localStorage.setItem(runKey(wallet, game), id.toString());
      setMessage('Active run recovered from the contract.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not recover run.'); }
    finally { setBusy(false); }
  }

  async function syncRun() {
    if (!runId) return;
    try {
      setBusy(true);
      const epoch = sessionEpoch.current;
      const latest = await refresh(runId, epoch);
      if (epoch !== sessionEpoch.current) return;
      setMessage(latest.active ? 'Run state refreshed from the contract.' : 'Run closed on-chain. Start a new run.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not refresh run.'); }
    finally { setBusy(false); }
  }

  async function claimFaucet() {
    const client = walletClient();
    if (!client || !wallet || !token) return;
    try {
      setBusy(true);
      const epoch = sessionEpoch.current;
      const hash = await client.writeContract({ address: token, abi: tokenAbi, functionName: 'claimFaucet', account: wallet, chain });
      await confirmed(hash);
      if (epoch !== sessionEpoch.current) return;
      setBalance(await publicClient.readContract({ address: token, abi: tokenAbi, functionName: 'balanceOf', args: [wallet] }));
      setMessage('Test tokens claimed.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Faucet claim failed.'); }
    finally { setBusy(false); }
  }

  async function transact(action: 'start' | 'advance' | 'resolve' | 'cashOut', choice?: number) {
    const client = walletClient();
    if (!client || !wallet || !token || !entry || !configured || (action === 'start' && paused)) return;
    try {
      setBusy(true); setMessage('Check your wallet and wait for transaction confirmation.');
      const epoch = sessionEpoch.current;
      if (action === 'start') {
        const currentlyPaused = await publicClient.readContract({ address: game, abi: gameAbi, functionName: 'paused' });
        setPaused(currentlyPaused);
        if (currentlyPaused) throw new Error('New entries are paused. Existing runs can still settle.');
        const allowance = await publicClient.readContract({ address: token, abi: tokenAbi, functionName: 'allowance', args: [wallet, game] });
        if (allowance < entry) {
          const approval = await client.writeContract({ address: token, abi: tokenAbi, functionName: 'approve', args: [game, entry], account: wallet, chain });
          await confirmed(approval);
          if (epoch !== sessionEpoch.current) return;
        }
        const hash = await client.writeContract({ address: game, abi: gameAbi, functionName: 'start', args: [choice!], account: wallet, chain });
        const receipt = await confirmed(hash);
        if (epoch !== sessionEpoch.current) return;
        const events = parseEventLogs({ abi: gameAbi, logs: receipt.logs, eventName: 'RunStarted' });
        const id = events[0]?.args.runId;
        if (!id) throw new Error('Start confirmed, but the run ID was not found. Inspect the transaction.');
        setRunId(id); localStorage.setItem(runKey(wallet, game), id.toString()); await refresh(id, epoch);
        if (epoch !== sessionEpoch.current) return;
        setMessage('Choice locked on-chain. Wait for the selected beacon.');
      } else if (runId) {
        let hash: `0x${string}`;
        if (action === 'advance') hash = await client.writeContract({ address: game, abi: gameAbi, functionName: 'advance', args: [runId, choice!], account: wallet, chain });
        else if (action === 'cashOut') hash = await client.writeContract({ address: game, abi: gameAbi, functionName: 'cashOut', args: [runId], account: wallet, chain });
        else {
          if (!run) throw new Error('Load your run first.');
          const registryAddress = await publicClient.readContract({ address: game, abi: gameAbi, functionName: 'registry' });
          const cached = await publicClient.readContract({ address: registryAddress, abi: registryAbi, functionName: 'hasSig', args: [run.round] });
          let signature: `0x${string}` = '0x';
          if (!cached) {
            const response = await fetch(`https://api.drand.sh/v2/beacons/quicknet/rounds/${run.round}`);
            if (!response.ok) throw new Error('Beacon is not published yet. Try again after its scheduled time.');
            const beacon = await response.json() as { round?: number; signature?: string };
            if (beacon.round !== Number(run.round) || !beacon.signature || !/^[0-9a-fA-F]{96}$/.test(beacon.signature)) throw new Error('Beacon response does not match the locked round.');
            signature = `0x${beacon.signature}`;
          }
          hash = await client.writeContract({ address: game, abi: gameAbi, functionName: 'resolve', args: [runId, signature], account: wallet, chain });
        }
        await confirmed(hash);
        if (epoch !== sessionEpoch.current) return;
        const settled = await refresh(runId, epoch);
        if (epoch !== sessionEpoch.current) return;
        if (action === 'cashOut' || !settled.active) { localStorage.removeItem(runKey(wallet, game)); }
        if (action === 'cashOut') { setRunId(undefined); setRun(undefined); }
        setMessage(action === 'resolve' ? settled.active ? 'Safe door settled on-chain. Bank or go deeper.' : 'Trap settled on-chain. The unbanked claim was lost.' : action === 'cashOut' ? 'Payout confirmed.' : 'Next choice locked on-chain.');
      }
      const nextBalance = await publicClient.readContract({ address: token, abi: tokenAbi, functionName: 'balanceOf', args: [wallet] });
      if (epoch === sessionEpoch.current) setBalance(nextBalance);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Transaction failed.'); }
    finally { setBusy(false); }
  }

  return <main style={{ maxWidth: 760, margin: '50px auto', padding: 24, color: '#f7f3e8', fontFamily: 'Arial,sans-serif' }}>
    <a href="/" style={{ color: '#e5bd78' }}>← Free-play game</a><h1 style={{ fontSize: 48, margin: '28px 0 10px' }}>Vaultbreaker Testnet</h1>
    <p style={{ color: '#c9bba3', lineHeight: 1.6 }}>Paid test-token rounds use a future verified drand beacon and route a 10% entry fee to the configured Operator Fee Router. Every transaction requires wallet confirmation and testnet gas.</p>
    {!configured && <p style={{ border: '1px solid #d8ac66', padding: 18, color: '#e5bd78' }}>Testnet play is gated. Configure the verified game address and runtime code hash after the contract and its dependencies are deployed. No paid entry is available.</p>}
    <p aria-live="polite" style={{ minHeight: 40 }}>{message}</p>
    <button disabled={busy || !configured} onClick={connect}>{wallet ? `Wallet ${wallet.slice(0, 6)}…${wallet.slice(-4)}` : 'CONNECT WALLET'}</button>
    {wallet && <div style={{ marginTop: 28, border: '1px solid #68533a', padding: 20 }}>
      <p>Entry: {entry !== undefined ? formatUnits(entry, decimals) : '…'} {symbol} · Operator fee: 10% · Chain: Robinhood Testnet</p>
      {paused && <p role="status">New entries are paused. Existing runs can still resolve and cash out.</p>}
      <p>Wallet balance: {balance !== undefined ? formatUnits(balance, decimals) : '…'} {symbol} <button disabled={busy} onClick={claimFaucet}>CLAIM TEST TOKENS</button></p>
      {!runId && <><h2>Choose your first door</h2>{[0, 1, 2].map(i => <button key={i} disabled={busy || paused} onClick={() => transact('start', i)} style={{ margin: 6 }}>DOOR {i + 1}</button>)}<p>Have an active run from another browser session? Enter its on-chain run ID from the start transaction.</p><input aria-label="Run ID" inputMode="numeric" value={recoveryId} onChange={event => setRecoveryId(event.target.value)} style={{ padding: 8, marginRight: 8 }} /><button disabled={busy || !recoveryId.trim()} onClick={recoverRun}>RECOVER RUN</button></>}
      {runId && run && <><p>Run #{runId.toString()} · Chamber {run.stage}/6 · Locked round {run.round.toString()}</p><p>Current claim: {formatUnits(run.credits, decimals)} {symbol} <button disabled={busy} onClick={syncRun}>REFRESH RUN</button></p>
        {run.active && run.awaiting && <button disabled={busy} onClick={() => transact('resolve')}>RESOLVE WITH DRAND</button>}
        {run.active && !run.awaiting && <><button disabled={busy} onClick={() => transact('cashOut')}>BANK CLAIM</button>{run.stage < 6 && [0, 1, 2].map(i => <button key={i} disabled={busy} onClick={() => transact('advance', i)} style={{ margin: 6 }}>NEXT DOOR {i + 1}</button>)}</>}
        {!run.active && <button onClick={() => { localStorage.removeItem(runKey(wallet, game)); setRunId(undefined); setRun(undefined); }}>START A NEW RUN</button>}
      </>}
    </div>}
    <p style={{ marginTop: 30, color: '#a7977c', fontSize: 13 }}>Test tokens have no monetary value here. This interface is gated until a testnet Registry, Router, token, and funded game contract are deployed and validated. Free play uses virtual multipliers and browser randomness; paid rounds use a future verified beacon.</p>
  </main>;
}
