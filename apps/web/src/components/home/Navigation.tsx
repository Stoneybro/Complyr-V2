"use client";
import React from 'react';
import Link from 'next/link';

export default function Navigation() {
  return (
    <header className="fixed top-0 w-full flex justify-between items-center px-4 md:px-6 py-4 mx-auto bg-surface/80 backdrop-blur-none border-b border-outline-variant/20 z-50">
      <div className="text-xl font-bold tracking-tighter text-on-surface">
        <div className="flex items-center gap-3">
          <img
            alt="COMPLYR Logo"
            className="h-8 w-auto"
            src="/complyrlogo-light.svg"
          />
          <span className="font-bold uppercase tracking-tighter text-2xl">Complyr</span>
        </div>
      </div>
      <nav className="hidden md:flex gap-8 items-center pr-6">
        <Link
          href="/docs"
          className="relative text-xs font-semibold uppercase tracking-widest text-on-surface group py-1"
        >
          Documentation
          <span className="absolute left-0 bottom-0 w-full h-[1.5px] bg-on-surface scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left"></span>
        </Link>
        <Link
          href="https://github.com/Stoneybro/complyr"
          target="_blank"
          rel="noopener noreferrer"
          className="relative text-xs font-semibold uppercase tracking-widest text-on-surface group py-1"
        >
          GitHub
          <span className="absolute left-0 bottom-0 w-full h-[1.5px] bg-on-surface scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left"></span>
        </Link>
      </nav>
      <Link
        href="/payments"
        className="bg-white/10 border border-white/20 text-white px-5 py-2 text-xs font-semibold uppercase tracking-widest hover:bg-white/20 active:opacity-70 transition-all cursor-pointer"
      >
        Launch App
      </Link>
    </header>
  );
}
