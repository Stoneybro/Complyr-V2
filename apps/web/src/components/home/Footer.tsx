import React from 'react';
import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-surface-container-lowest border-t border-outline-variant/20">
      <div className="w-full grid grid-cols-1 md:grid-cols-4 gap-12 px-12 py-16 max-w-[1440px] mx-auto">
        <div className="md:col-span-2">
          <div className="text-lg font-bold text-on-surface mb-6 uppercase tracking-tighter">
            <div className="flex items-center gap-3">
              <img
                alt="COMPLYR Logo"
                className="h-8 w-auto"
                src="/complyrlogo-light.svg"
              />
              <span className="font-bold uppercase tracking-tighter text-2xl">Complyr</span>
            </div>
          </div>
          <p className="font-inter text-[10px] uppercase tracking-widest leading-relaxed text-on-surface-variant max-w-xs mb-10">
            Private audit infrastructure for onchain business payments. Built for the future of institutional treasury.
          </p>
          <div className="flex gap-4 items-center">
            <div className="w-10 h-px bg-on-surface"></div>
            <span className="font-inter text-[10px] uppercase tracking-widest font-bold text-on-surface">Built for Onchain Auditability</span>
          </div>
        </div>
        <div>
          <h4 className="font-inter text-[10px] font-bold uppercase tracking-widest mb-8 text-on-surface">Resources</h4>
          <ul className="space-y-4">
            <li><Link href="/login" className="font-inter text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-all underline">Demo</Link></li>
            <li><Link href="/docs" className="font-inter text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-all underline">Docs</Link></li>
            <li><Link href="https://github.com/Stoneybro/complyr" target="_blank" rel="noopener noreferrer" className="font-inter text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-all underline">GitHub</Link></li>
            <li><Link href="https://github.com/Stoneybro/complyr/tree/main/packages/contract" target="_blank" rel="noopener noreferrer" className="font-inter text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-all underline">Contracts</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-inter text-[10px] font-bold uppercase tracking-widest mb-8 text-on-surface">Powered By</h4>
          <ul className="space-y-4">
            <li><span className="font-inter text-[10px] uppercase tracking-widest text-on-surface-variant">ETHEREUM SEPOLIA</span></li>
            <li><span className="font-inter text-[10px] uppercase tracking-widest text-on-surface-variant">ZAMA FHE</span></li>
            <li><span className="font-inter text-[10px] uppercase tracking-widest text-on-surface-variant">ENVIO</span></li>
          </ul>
        </div>
      </div>
      <div className="px-12 pb-8 flex flex-col md:flex-row justify-between items-center border-t border-outline-variant/20 pt-8">
        <p className="font-inter text-[10px] uppercase tracking-widest text-on-surface-variant">
          © 2026 COMPLYR INFRASTRUCTURE.
        </p>
        <p className="font-inter text-[10px] uppercase tracking-widest text-on-surface-variant/50">
          ENCRYPTED COMPUTATION. IMMUTABLE AUDIT RECORDS. ONCHAIN SETTLEMENT.
        </p>
      </div>
    </footer>
  );
}
