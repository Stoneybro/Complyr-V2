import Navigation from '../components/home/Navigation';
import Hero from '../components/home/Hero';
import Problem from '../components/home/Problem';
import Features from '../components/home/Features';
import HowItWorks from '../components/home/HowItWorks';
import UseCases from '../components/home/UseCases';
import Technology from '../components/home/Technology';
import FinalCTA from '../components/home/FinalCTA';
import Footer from '../components/home/Footer';

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
          <FinalCTA />
        </main>
        <Footer />
      </div>
    </>
  );
}