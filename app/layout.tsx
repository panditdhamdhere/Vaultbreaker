import type { Metadata } from 'next';
import './styles.css';
export const metadata: Metadata = { title: 'Vaultbreaker — One more door?', description: 'Choose a door, grow your virtual claim, and decide when to bank it in this six-chamber vault game.' };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
