import type { Metadata } from 'next';
import './styles.css';
export const metadata: Metadata = { title: 'Vaultbreaker — One more door?', description: 'A fast risk-and-reward vault game. Choose a door, bank your haul, or press deeper.' };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
