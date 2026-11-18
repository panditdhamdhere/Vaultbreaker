'use client';
import { useCallback, useMemo, useState } from 'react';
import { createPublicClient, createWalletClient, custom, defineChain, formatUnits, http, isAddress, parseAbi, parseEventLogs, type Address } from 'viem';

const address = process.env.NEXT_PUBLIC_VAULTBREAKER_ADDRESS;
const rpc = process.env.NEXT_PUBLIC_RH_TESTNET_RPC || 'https://rpc.testnet.chain.robinhood.com';
const chain = defineChain({ id: 46630, name: 'Robinhood Testnet', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const gameAbi = parseAbi([
  'function entryAmount() view returns (uint256)',
  'function token() view returns (address)',
  'function registry() view returns (address)',
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
const publicClient = createPublicClient({ chain, transport: http(rpc) });

export default function TestnetPage() {
  const [wallet, setWallet] = useState<Address>();
  const [token, setToken] = useState<Address>();
  const [entry, setEntry] = useState<bigint>();
  const [decimals, setDecimals] = useState(18);
  const [symbol, setSymbol] = useState('TOKEN');
  const [balance, setBalance] = useState<bigint>();
  const [runId, setRunId] = useState<bigint>();
  const [run, setRun] = useState<RunView>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Connect a wallet to inspect a configured testnet game.');
  const configured = !!address && isAddress(address);
  const game = address as Address;
  const walletClient = useMemo(() => typeof window !== 'undefined' && 'ethereum' in window
    ? createWalletClient({ chain, transport: custom((window as Window & { ethereum: object }).ethereum as Parameters<typeof custom>[0]) })
    : null, []);

  const refresh = useCallback(async (id: bigint) => {
    const result = await publicClient.readContract({ address: game, abi: gameAbi, functionName: 'runs', args: [id] });
    setRun({ round: result[1], stage: result[2], credits: result[4], active: result[5], awaiting: result[6] });
  }, [game]);

  async function connect() {
    if (!walletClient || !configured) { setMessage('Install an EVM wallet and configure the game contract first.'); return; }
    try {
      setBusy(true);
      const [account] = await walletClient.requestAddresses();
      if (!account) throw new Error('Wallet returned no account.');
      await walletClient.switchChain({ id: chain.id });
      const asset = await publicClient.readContract({ address: game, abi: gameAbi, functionName: 'token' });
      const [amount, d, s] = await Promise.all([
        publicClient.readContract({ address: game, abi: gameAbi, functionName: 'entryAmount' }),
        publicClient.readContract({ address: asset, abi: tokenAbi, functionName: 'decimals' }),
        publicClient.readContract({ address: asset, abi: tokenAbi, functionName: 'symbol' }),
      ]);
      setWallet(account); setToken(asset); setEntry(amount); setDecimals(d); setSymbol(s);
      setBalance(await publicClient.readContract({ address: asset, abi: tokenAbi, functionName: 'balanceOf', args: [account] }));
      const saved = localStorage.getItem(`vaultbreakerRun:${account.toLowerCase()}`);
      if (saved) {
        const id = BigInt(saved);
        const existing = await publicClient.readContract({ address: game, abi: gameAbi, functionName: 'runs', args: [id] });
        if (existing[0].toLowerCase() === account.toLowerCase() && existing[5]) {
          setRunId(id); await refresh(id); setMessage('Active run restored from the contract.');
        } else localStorage.removeItem(`vaultbreakerRun:${account.toLowerCase()}`);
      } else setMessage('Connected. Choose one of three doors to lock a future beacon.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Wallet connection failed.'); }
    finally { setBusy(false); }
  }

  async function claimFaucet() {
    if (!walletClient || !wallet || !token) return;
    try {
      setBusy(true);
      const hash = await walletClient.writeContract({ address: token, abi: tokenAbi, functionName: 'claimFaucet', account: wallet, chain });
      await publicClient.waitForTransactionReceipt({ hash });
      setBalance(await publicClient.readContract({ address: token, abi: tokenAbi, functionName: 'balanceOf', args: [wallet] }));
      setMessage('Test tokens claimed.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Faucet claim failed.'); }
    finally { setBusy(false); }
  }

  async function transact(action: 'start' | 'advance' | 'resolve' | 'cashOut', choice?: number) {
    if (!walletClient || !wallet || !token || !entry || !configured) return;
    try {
      setBusy(true); setMessage('Check your wallet and wait for transaction confirmation.');
      if (action === 'start') {
        const allowance = await publicClient.readContract({ address: token, abi: tokenAbi, functionName: 'allowance', args: [wallet, game] });
        if (allowance < entry) {
          const approval = await walletClient.writeContract({ address: token, abi: tokenAbi, functionName: 'approve', args: [game, entry], account: wallet, chain });
          await publicClient.waitForTransactionReceipt({ hash: approval });
        }
        const hash = await walletClient.writeContract({ address: game, abi: gameAbi, functionName: 'start', args: [choice!], account: wallet, chain });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        const events = parseEventLogs({ abi: gameAbi, logs: receipt.logs, eventName: 'RunStarted' });
        const id = events[0]?.args.runId;
        if (!id) throw new Error('Start confirmed, but the run ID was not found. Inspect the transaction.');
        setRunId(id); localStorage.setItem(`vaultbreakerRun:${wallet.toLowerCase()}`, id.toString()); await refresh(id); setMessage('Choice locked on-chain. Wait for the selected beacon.');
      } else if (runId) {
        let hash: `0x${string}`;
        if (action === 'advance') hash = await walletClient.writeContract({ address: game, abi: gameAbi, functionName: 'advance', args: [runId, choice!], account: wallet, chain });
        else if (action === 'cashOut') hash = await walletClient.writeContract({ address: game, abi: gameAbi, functionName: 'cashOut', args: [runId], account: wallet, chain });
        else {
          if (!run) throw new Error('Load your run first.');
          const registryAddress = await publicClient.readContract({ address: game, abi: gameAbi, functionName: 'registry' });
          const cached = await publicClient.readContract({ address: registryAddress, abi: registryAbi, functionName: 'hasSig', args: [run.round] });
          let signature: `0x${string}` = '0x';
          if (!cached) {
            const response = await fetch(`https://api.drand.sh/v2/beacons/quicknet/rounds/${run.round}`);
            if (!response.ok) throw new Error('Beacon is not published yet. Try again after its scheduled time.');
            const beacon = await response.json() as { signature?: string };
            if (!beacon.signature) throw new Error('Beacon signature missing.');
            signature = `0x${beacon.signature}`;
          }
          hash = await walletClient.writeContract({ address: game, abi: gameAbi, functionName: 'resolve', args: [runId, signature], account: wallet, chain });
        }
        await publicClient.waitForTransactionReceipt({ hash }); await refresh(runId);
        if (action === 'cashOut') { localStorage.removeItem(`vaultbreakerRun:${wallet.toLowerCase()}`); setRunId(undefined); setRun(undefined); }
        setMessage(action === 'resolve' ? 'Stage settled on-chain. Bank or go deeper if you survived.' : action === 'cashOut' ? 'Payout confirmed.' : 'Next choice locked on-chain.');
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Transaction failed.'); }
    finally { setBusy(false); }
  }

  return <main style={{ maxWidth: 760, margin: '50px auto', padding: 24, color: '#f7f3e8', fontFamily: 'Arial,sans-serif' }}>
    <a href="/" style={{ color: '#e5bd78' }}>← Free-play game</a><h1 style={{ fontSize: 48, margin: '28px 0 10px' }}>Vaultbreaker Testnet</h1>
    <p style={{ color: '#c9bba3', lineHeight: 1.6 }}>Paid test-token rounds use a future verified drand beacon and route a 10% entry fee to the configured Operator Fee Router. Every transaction requires wallet confirmation and testnet gas.</p>
    {!configured && <p style={{ border: '1px solid #d8ac66', padding: 18, color: '#e5bd78' }}>Testnet game is not deployed. Configure NEXT_PUBLIC_VAULTBREAKER_ADDRESS after the contract and its dependencies are verified. No paid entry is available.</p>}
    <p aria-live="polite" style={{ minHeight: 40 }}>{message}</p>
    <button disabled={busy || !configured} onClick={connect}>{wallet ? `Wallet ${wallet.slice(0, 6)}…${wallet.slice(-4)}` : 'CONNECT WALLET'}</button>
    {wallet && <div style={{ marginTop: 28, border: '1px solid #68533a', padding: 20 }}>
      <p>Entry: {entry !== undefined ? formatUnits(entry, decimals) : '…'} {symbol} · Operator fee: 10% · Chain: Robinhood Testnet</p>
      <p>Wallet balance: {balance !== undefined ? formatUnits(balance, decimals) : '…'} {symbol} <button disabled={busy} onClick={claimFaucet}>CLAIM TEST TOKENS</button></p>
      {!runId && <><h2>Choose your first door</h2>{[0, 1, 2].map(i => <button key={i} disabled={busy} onClick={() => transact('start', i)} style={{ margin: 6 }}>DOOR {i + 1}</button>)}</>}
      {runId && run && <><p>Run #{runId.toString()} · Chamber {run.stage}/6 · Locked round {run.round.toString()}</p><p>Current claim: {formatUnits(run.credits, decimals)} {symbol}</p>
        {run.active && run.awaiting && <button disabled={busy} onClick={() => transact('resolve')}>RESOLVE WITH DRAND</button>}
        {run.active && !run.awaiting && <><button disabled={busy} onClick={() => transact('cashOut')}>BANK CLAIM</button>{run.stage < 6 && [0, 1, 2].map(i => <button key={i} disabled={busy} onClick={() => transact('advance', i)} style={{ margin: 6 }}>NEXT DOOR {i + 1}</button>)}</>}
        {!run.active && <button onClick={() => { localStorage.removeItem(`vaultbreakerRun:${wallet.toLowerCase()}`); setRunId(undefined); setRun(undefined); }}>START A NEW RUN</button>}
      </>}
    </div>}
    <p style={{ marginTop: 30, color: '#a7977c', fontSize: 13 }}>Test tokens have no monetary value here. This interface is gated until a testnet Registry, Router, token, and funded game contract are deployed and validated. The free-play scanner is unavailable in paid mode because the future beacon cannot reveal a trap in advance.</p>
  </main>;
}
