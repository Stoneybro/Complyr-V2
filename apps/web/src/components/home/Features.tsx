"use client";

import React from 'react';
import { motion } from 'framer-motion';

const features = [
  {
    icon: 'link',
    title: 'Immutable Evidence Anchors',
    body: 'Plaintext hashes of off-chain invoices and purchase orders are anchored to every transaction to prevent tampering.',
  },
  {
    icon: 'manage_accounts',
    title: 'Tiered Access Controls',
    body: 'Analytics-level auditors see encrypted rollups and metadata. Full-access auditors decrypt flagged transaction amounts scoped strictly to their engagement.',
  },
  {
    icon: 'pie_chart',
    title: 'Blind Category Rollups',
    body: 'Complyr updates all General Ledger category buckets simultaneously using FHE.select, so storage diffs reveal nothing to chain observers.',
  },
  {
    icon: 'lock',
    title: 'Encrypted Test Thresholds',
    body: 'Auditors encrypt their test limits client-side. The business never knows the limits they are being tested against, preventing them from gaming the system.',
  },
  {
    icon: 'bolt',
    title: 'Trustless Callbacks',
    body: 'Audit checks are embedded directly in the token transfer function. Businesses cannot skip the audit step or manipulate reported amounts.',
  },
  {
    icon: 'shield',
    title: 'Isolated Audit Workspaces',
    body: 'External auditors get a dedicated, read-only portal to view findings, track analytics, and execute authorized decryptions.',
  },
];

export default function Features() {
  return (
    <section className="py-32 px-6 md:px-12 bg-surface-container-high overflow-hidden">
      <div className="max-w-6xl mx-auto">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
          className="mb-20"
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-outline block mb-4">Built for real-world auditing workflows</span>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight max-w-2xl">Everything an auditor needs. Total privacy for the business.</h2>
        </motion.div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-outline-variant/20 border border-outline-variant/20 mt-12">
          {features.map((f) => (
            <div 
              key={f.title}
              className="bg-surface p-10 flex flex-col justify-between min-h-[280px]"
            >
              <div>
                <span className="material-symbols-outlined text-3xl mb-6 text-on-surface">{f.icon}</span>
                <h3 className="font-bold uppercase text-sm tracking-widest mb-4">{f.title}</h3>
              </div>
              <p className="text-sm text-on-surface-variant">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
