"use client";

import React from 'react';
import { motion } from 'framer-motion';

const steps = [
  {
    num: '01',
    title: 'ENCRYPTED CONTEXT',
    label: '01 / ENCRYPTED CONTEXT',
    body: 'FHE encrypts business context, like GL categories and invoice hashes, alongside the payment amount.',
  },
  {
    num: '02',
    title: 'TRUSTLESS CALLBACK',
    label: '02 / TRUSTLESS CALLBACK',
    body: 'The token contract automatically triggers the audit infrastructure upon transfer, eliminating self-reporting fraud.',
  },
  {
    num: '03',
    title: 'RUNTIME EVALUATION',
    label: '03 / RUNTIME CIPHERTEXT EVALUATION',
    body: 'The smart contract evaluates auditor thresholds against the encrypted payment data natively on-chain.',
  },
  {
    num: '04',
    title: 'ISOLATED REVEAL',
    label: '04 / ISOLATED REVEAL',
    body: 'Auditors only receive decrypted pass/fail results, with tiered access controls governing any further visibility.',
  },
];

export default function HowItWorks() {
  return (
    <section className="py-32 px-6 md:px-12 bg-surface">
      <div className="max-w-6xl mx-auto">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="flex flex-col md:flex-row justify-between items-end mb-24 border-b border-primary pb-8"
        >
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-outline block mb-4">The Solution</span>
            <h2 className="text-5xl font-bold tracking-tighter uppercase">A trustless, confidential audit layer.</h2>
          </div>
          <div className="hidden md:block text-right">
            <span className="font-mono text-xs opacity-50">DEMO_BUILD: ALFA</span>
          </div>
        </motion.div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-0 divide-x divide-outline-variant/20 border border-outline-variant/20">
          {steps.map((step, i) => (
            <motion.div 
              key={step.num}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: i * 0.1, ease: "easeOut" }}
              className="p-8 hover:bg-surface-container-lowest transition-colors group"
            >
              <motion.div 
                whileHover={{ scale: 1.05, opacity: 0.5 }}
                className="font-mono text-4xl mb-4 opacity-10 group-hover:opacity-100 transition-opacity origin-left"
              >
                {step.num}
              </motion.div>
              <span className="text-[9px] font-bold uppercase tracking-widest text-outline block mb-6">{step.label}</span>
              <h3 className="text-xs font-bold uppercase tracking-widest mb-4">{step.title}</h3>
              <p className="text-sm text-on-surface-variant leading-relaxed">{step.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
