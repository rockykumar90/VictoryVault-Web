import React, { useState, useEffect } from 'react';
import { useAppStore } from './store/useAppStore';
import Dashboard from './components/Dashboard';
import PdfSuite from './components/DocumentPDF/PdfSuite';
import PassportStudio from './components/PassportPhoto/PassportStudio';
import PdfCompressor from './components/PdfCompress/PdfCompressor';
import ImageCompressor from './components/ImageCompress/ImageCompressor';
import PdfOrganizer from './components/PdfOrganizer/PdfOrganizer';
import { ShieldCheck, Layers, FileText, Camera, Minimize2, Image as ImageIcon, Combine } from 'lucide-react';

export default function App() {
  const currentMode = useAppStore((state) => state.currentMode);
  const setMode = useAppStore((state) => state.setMode);

  const [scrollY, setScrollY] = useState(0);
  const [rect, setRect] = useState(null);
  const [descRect, setDescRect] = useState(null);

  useEffect(() => {
    if (currentMode !== 'dashboard') return;

    const handleScroll = () => {
      setScrollY(window.scrollY);
    };

    const measure = () => {
      const el = document.getElementById('hero-title');
      if (el) {
        const r = el.getBoundingClientRect();
        setRect({
          left: r.left + window.scrollX,
          top: r.top + window.scrollY,
          width: r.width,
          height: r.height
        });
      }

      const descEl = document.getElementById('hero-desc');
      if (descEl) {
        const r = descEl.getBoundingClientRect();
        setDescRect({
          left: r.left + window.scrollX,
          top: r.top + window.scrollY,
          width: r.width,
          height: r.height
        });
      }
    };

    measure();
    const id = requestAnimationFrame(measure);

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', measure);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', measure);
      cancelAnimationFrame(id);
    };
  }, [currentMode]);

  const progress = Math.min(scrollY / 150, 1);

  return (
    <div className="min-h-screen flex flex-col font-sans w-full">
      {currentMode === 'dashboard' && (
        <div 
          onClick={() => setMode('dashboard')}
          style={{
            position: 'fixed',
            zIndex: 50,
            transformOrigin: 'top left',
            whiteSpace: 'nowrap',
            pointerEvents: scrollY >= 150 ? 'none' : 'auto',
            transition: 'none',
            fontFamily: "var(--font-sans)",
            fontWeight: 800,
            letterSpacing: '-0.025em',
            color: '#ffffff',
            fontSize: rect ? `${rect.height * 0.9}px` : '3.75rem',
            left: rect ? `calc(${rect.left}px - ${progress * (rect.left - 24)}px)` : '50%',
            top: rect ? `calc(${rect.top}px - ${scrollY}px - ${progress * (rect.top - scrollY - 26)}px)` : '180px',
            transform: rect ? `scale(${1 - progress * (1 - (20 / rect.height))})` : 'translate(-50%, 0)'
          }}
          className="cursor-pointer select-none"
        >
          Victory <span className="bg-gradient-to-r from-primary to-blue-500 bg-clip-text text-transparent">Vault</span>
        </div>
      )}

      {currentMode === 'dashboard' && (
        <div 
          style={{
            position: 'fixed',
            zIndex: 50,
            transformOrigin: 'top left',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            transition: 'none',
            fontFamily: "var(--font-sans)",
            fontWeight: 500,
            color: '#9ca3af',
            fontSize: descRect ? `${descRect.height * 0.95}px` : '1.125rem',
            left: descRect ? `calc(${descRect.left}px - ${progress * (descRect.left - (window.innerWidth - 24 - descRect.width * (12 / descRect.height)))}px)` : '50%',
            top: descRect ? `calc(${descRect.top}px - ${scrollY}px - ${progress * (descRect.top - scrollY - 30)}px)` : '240px',
            transform: descRect ? `scale(${1 - progress * (1 - (12 / descRect.height))})` : 'translate(-50%, 0)',
            opacity: (typeof window !== 'undefined' && window.innerWidth < 768) ? Math.max(0, 1 - progress * 1.5) : 1
          }}
          className="select-none text-center"
        >
          Private browser-based document & photo suite
        </div>
      )}

      {/* Premium Glass Header */}
      <header className="sticky top-0 z-40 w-full glass-panel border-b border-white/5 py-6 px-6 flex items-center justify-between mb-6">
        <div 
          onClick={() => setMode('dashboard')}
          className="flex items-center gap-2.5 cursor-pointer hover:opacity-85 transition-opacity"
        >
          {currentMode !== 'dashboard' && (
            <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white via-gray-100 to-gray-400 bg-clip-text text-transparent">
              Victory Vault
            </span>
          )}
        </div>

        {/* Dynamic Mode Switcher on Header */}
        {currentMode !== 'dashboard' && (
          <nav className="hidden md:flex items-center gap-1 bg-black/45 p-1 rounded-xl border border-white/5">
            <button
              onClick={() => setMode('pdf-converter')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all
                ${currentMode === 'pdf-converter' 
                  ? 'bg-primary/10 text-primary border border-primary/20' 
                  : 'text-gray-400 hover:text-white border border-transparent'}`}
            >
              <FileText className="w-3.5 h-3.5" />
              Photo to PDF
            </button>
            <button
              onClick={() => setMode('passport-generator')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all
                ${currentMode === 'passport-generator' 
                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' 
                  : 'text-gray-400 hover:text-white border border-transparent'}`}
            >
              <Camera className="w-3.5 h-3.5" />
              Passport Studio
            </button>
            <button
              onClick={() => setMode('pdf-compressor')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all
                ${currentMode === 'pdf-compressor' 
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                  : 'text-gray-400 hover:text-white border border-transparent'}`}
            >
              <Minimize2 className="w-3.5 h-3.5" />
              PDF Compressor
            </button>
            <button
              onClick={() => setMode('image-compressor')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all
                ${currentMode === 'image-compressor' 
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                  : 'text-gray-400 hover:text-white border border-transparent'}`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              Image Compressor
            </button>
            <button
              onClick={() => setMode('pdf-organizer')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all
                ${currentMode === 'pdf-organizer' 
                  ? 'bg-primary/10 text-primary border border-primary/20' 
                  : 'text-gray-400 hover:text-white border border-transparent'}`}
            >
              <Combine className="w-3.5 h-3.5" />
              PDF Merge/Split
            </button>
          </nav>
        )}
      </header>

      {/* Main Workspace content */}
      <main className="flex-1 w-full relative z-10 flex flex-col overflow-x-hidden">
        {currentMode === 'dashboard' && <Dashboard />}
        {currentMode === 'pdf-converter' && <PdfSuite />}
        {currentMode === 'passport-generator' && <PassportStudio />}
        {currentMode === 'pdf-compressor' && <PdfCompressor />}
        {currentMode === 'image-compressor' && <ImageCompressor />}
        {currentMode === 'pdf-organizer' && <PdfOrganizer />}
      </main>

      {/* Modern Mini Footer */}
      {currentMode === 'dashboard' && (
        <footer className="w-full py-6 border-t border-white/5 bg-black/20 text-center text-xs text-gray-500 relative z-10">
          <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p>© {new Date().getFullYear()} Victory Vault. All processing operates client-side.</p>
            <div className="flex gap-4">
              <span className="hover:text-gray-400 transition-colors">Privacy Secured</span>
              <span className="hover:text-gray-400 transition-colors">GPU Accelerated</span>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
