import Navigation from './Navigation';
import Hero from './Hero';
import Problem from './Problem';
import Features from './Features';
import HowItWorks from './HowItWorks';
import UseCases from './UseCases';
import Technology from './Technology';
import FinalCTA from './FinalCTA';
import Footer from './Footer';

export default function HomePage() {
  return (
    <>
      <link 
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" 
        rel="stylesheet" 
      />
      <div 
        className="min-h-screen bg-surface text-on-surface font-body selection:bg-primary selection:text-on-primary"
        style={{ WebkitFontSmoothing: 'antialiased' }}
      >
        <Navigation />
        <main className="pt-16">
          <Hero />
          <Problem />
          <HowItWorks />
          <Features />
          <UseCases />
          <Technology />
          <FinalCTA />
        </main>
        <Footer />
      </div>
    </>
  );
}