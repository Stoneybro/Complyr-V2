"use client";

import React from 'react';
import { motion } from 'framer-motion';

const usecases = [
  {
    title: 'Startups & Investors',
    num: '01',
    body: 'Provide VCs and board members with cryptographically verified financial reports without exposing individual employee salaries or vendor contracts.',
  },
  {
    title: 'Institutions & Grants',
    num: '02',
    body: 'Prove to government bodies or grant providers that funds were allocated exactly as mandated, backed by immutable on-chain evidence.',
  },
  {
    title: 'Regulated Stablecoins',
    num: '03',
    body: 'Maintain ISA-standard compliance for private stablecoin transfers to satisfy traditional accounting and regulatory requirements.',
  },
  {
    title: 'Web3 DAOs',
    num: '04',
    body: 'Automate contributor payouts while maintaining public accountability for the community and private, auditable records for the foundation.',
  },
];

export default function UseCases() {
  return (
    <section className="py-32 px-6 md:px-12 bg-surface">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-20 items-start">
          <motion.div 
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-outline block mb-4">Who is Complyr for?</span>
            <h2 className="text-5xl font-bold tracking-tighter uppercase leading-[1.1] mb-8 text-on-surface">Bridging the gap between private transactions and accountability.</h2>
            <div className="h-2 w-24 bg-primary mb-12"></div>
            <p className="text-sm text-on-surface-variant uppercase leading-loose tracking-tighter max-w-xs">
              For organizations that must prove compliance without exposing their entire financial history.
            </p>
          </motion.div>
          <div className="grid grid-cols-1 gap-12">
            {usecases.map((uc, i) => (
              <motion.div 
                key={uc.num} 
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.5, delay: i * 0.15, ease: "easeOut" }}
                className={`border-l-4 pl-8 py-2 ${i === 0 ? 'border-primary' : 'border-outline-variant'}`}
              >
                <span className="font-mono text-[10px] text-outline block mb-1">{uc.num}</span>
                <h4 className="text-lg font-bold uppercase mb-2">{uc.title}</h4>
                <p className="text-on-surface-variant text-sm leading-relaxed">{uc.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
