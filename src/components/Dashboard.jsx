import React, { useRef, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { FileText, Camera, Shield, Zap, Sparkles, Image, Check, Minimize2, Combine } from 'lucide-react';

function ScrollCard({ children, className, index }) {
  const cardRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => {
      const el = cardRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const windowWidth = window.innerWidth;

      // Calculate how far the card is from the center of the viewport vertically
      const cardCenterY = rect.top + rect.height / 2;
      const viewportCenterY = windowHeight / 2;

      // Distance from center (-1 at top edge of viewport, +1 at bottom edge of viewport)
      const distanceY = (cardCenterY - viewportCenterY) / (windowHeight / 2);

      // Determine if the card is on the left or right side of the screen
      const cardCenterX = rect.left + rect.width / 2;
      const viewportCenterX = windowWidth / 2;
      const isLeft = cardCenterX < viewportCenterX - 40;
      const isRight = cardCenterX > viewportCenterX + 40;

      let translateX = 0;
      let opacity = 1;
      let scale = 1;

      const isMobile = windowWidth < 768;
      const goesLeft = isMobile ? (index % 2 === 0) : isLeft;
      const goesRight = isMobile ? (index % 2 !== 0) : isRight;
      const maxDisplacement = isMobile ? 30 : 120;

      if (rect.bottom > 0 && rect.top < windowHeight) {
        const absDistY = Math.abs(distanceY);
        // We start translating when the card is past 15% distance from center
        const factor = Math.min(1, Math.max(0, (absDistY - 0.15) / 0.85));

        // Displacement factor: smooth non-linear scale
        const displacement = Math.pow(factor, 1.5) * maxDisplacement;

        if (goesLeft) {
          translateX = -displacement;
        } else if (goesRight) {
          translateX = displacement;
        } else {
          // Middle card: let's make it scale down slightly
          scale = 1 - (factor * 0.12);
        }

        // Smoothly fade out near the top/bottom edges of the screen
        opacity = 1 - Math.pow(factor, 2) * 0.7;
      } else {
        // Fully out of viewport
        opacity = 0.3;
        if (goesLeft) translateX = -maxDisplacement;
        if (goesRight) translateX = maxDisplacement;
        if (!goesLeft && !goesRight) scale = 0.88;
      }

      el.style.transform = `translateX(${translateX}px) scale(${scale})`;
      el.style.opacity = opacity;
    };

    // Run once on mount
    handleScroll();

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [index]);

  return (
    <div 
      ref={cardRef} 
      className={className}
      style={{
        transition: 'transform 0.15s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.15s cubic-bezier(0.25, 1, 0.5, 1)',
        willChange: 'transform, opacity'
      }}
    >
      {children}
    </div>
  );
}

export default function Dashboard() {
  const setMode = useAppStore((state) => state.setMode);

  return (
    <div className="flex flex-col items-center justify-center min-h-[85vh] px-4 py-8">
      {/* Hero Header */}
      <div className="text-center max-w-2xl mb-12 animate-fade-in w-full px-4 overflow-hidden">
        <h1 
          className="text-3xl sm:text-4xl md:text-6xl font-extrabold tracking-tight text-transparent mb-6 select-none whitespace-nowrap"
        >
          <span id="hero-title">Victory Vault</span>
        </h1>
        <p className="text-xs sm:text-sm md:text-lg text-transparent leading-relaxed select-none whitespace-nowrap">
          <span id="hero-desc">Private browser-based document & photo suite</span>
        </p>
      </div>

      {/* Main Feature Cards */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-6xl px-2">
        {/* Document to PDF Card */}
        <ScrollCard index={0} className="w-full">
          <div 
            onClick={() => setMode('pdf-converter')}
            className="glass-panel rounded-2xl p-6 md:p-8 cursor-pointer relative overflow-hidden transition-all duration-300 border border-white/5 hover:border-primary/40 hover:-translate-y-1 hover:shadow-[0_20px_40px_-15px_rgba(170,59,255,0.25)] group h-full"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-all duration-300"></div>
            
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center mb-6 shadow-lg shadow-primary/20">
              <FileText className="w-7 h-7 text-white" />
            </div>
            
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              Photo to PDF
              <span className="text-xs font-normal text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">Suite</span>
            </h2>
            <p className="text-gray-400 mb-6 leading-relaxed text-sm">
              Drag & drop images, crop with custom aspect ratios, align multiple pictures per page, and generate high-fidelity print-ready A4 PDFs.
            </p>

            <ul className="space-y-2 text-xs text-gray-400">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                Drag-and-drop file uploader
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                Free-form & preset aspect-ratio cropping
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                Multi-image arrangement on pages
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                Export clean A4 files (300 DPI)
              </li>
            </ul>
          </div>
        </ScrollCard>

        {/* Passport Photo Studio Card */}
        <ScrollCard index={1} className="w-full">
          <div 
            onClick={() => setMode('passport-generator')}
            className="glass-panel rounded-2xl p-6 md:p-8 cursor-pointer relative overflow-hidden transition-all duration-300 border border-blue-500/40 hover:-translate-y-1 hover:shadow-[0_20px_40px_-15px_rgba(59,130,246,0.25)] group h-full"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl group-hover:bg-blue-500/10 transition-all duration-300"></div>

            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-6 shadow-lg shadow-blue-500/20">
              <Camera className="w-7 h-7 text-white" />
            </div>

            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              Passport Photo Maker
              <span className="text-xs font-normal text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">Studio</span>
            </h2>
            <p className="text-gray-400 mb-6 leading-relaxed text-sm">
              Strict aspect lock cropping, AI background removal, custom solid backgrounds, brush eraser tuning, and automatic A4 printing grids.
            </p>

            <ul className="space-y-2 text-xs text-gray-400">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                Strict 3.5cm x 4.5cm aspect cropping
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                Client-side AI Background Eraser
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                Manual brush refiner & zoom mode
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                A4 grid layout with cut marks
              </li>
            </ul>
          </div>
        </ScrollCard>

        {/* PDF Compressor Card */}
        <ScrollCard index={2} className="w-full">
          <div 
            onClick={() => setMode('pdf-compressor')}
            className="glass-panel rounded-2xl p-6 md:p-8 cursor-pointer relative overflow-hidden transition-all duration-300 border border-white/5 hover:border-emerald-500/40 hover:-translate-y-1 hover:shadow-[0_20px_40px_-15px_rgba(16,185,129,0.25)] group h-full"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl group-hover:bg-emerald-500/10 transition-all duration-300"></div>

            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/20">
              <Minimize2 className="w-7 h-7 text-white" />
            </div>

            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              PDF Size Reducer
              <span className="text-xs font-normal text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">Utility</span>
            </h2>
            <p className="text-gray-400 mb-6 leading-relaxed text-sm">
              Optimize scanned documents and reduce file sizes by re-sampling image resolutions and quality client-side.
            </p>

            <ul className="space-y-2 text-xs text-gray-400">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Dynamic JPEG resolution downscaling
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Adjustable JPEG compression values
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Maintains page orientations
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                100% Private local browser processing
              </li>
            </ul>
          </div>
        </ScrollCard>

        {/* Image Compressor Card */}
        <ScrollCard index={3} className="w-full">
          <div 
            onClick={() => setMode('image-compressor')}
            className="glass-panel rounded-2xl p-6 md:p-8 cursor-pointer relative overflow-hidden transition-all duration-300 border border-white/5 hover:border-emerald-500/40 hover:-translate-y-1 hover:shadow-[0_20px_40px_-15px_rgba(16,185,129,0.25)] group h-full"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl group-hover:bg-emerald-500/10 transition-all duration-300"></div>

            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/20">
              <Image className="w-7 h-7 text-white" />
            </div>

            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              Image Size Reducer
              <span className="text-xs font-normal text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">Utility</span>
            </h2>
            <p className="text-gray-400 mb-6 leading-relaxed text-sm">
              Straighten crooked files, crop photos/signatures, and compress sizes to JPG with real-time size updates.
            </p>

            <ul className="space-y-2 text-xs text-gray-400">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Straighten & crop templates
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Real-time output size tracking
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Export to .jpg format
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Form-optimized presets
              </li>
            </ul>
          </div>
        </ScrollCard>

        {/* PDF Merger & Splitter Card */}
        <ScrollCard index={4} className="w-full">
          <div 
            onClick={() => setMode('pdf-organizer')}
            className="glass-panel rounded-2xl p-6 md:p-8 cursor-pointer relative overflow-hidden transition-all duration-300 border border-white/5 hover:border-primary/40 hover:-translate-y-1 hover:shadow-[0_20px_40px_-15px_rgba(170,59,255,0.25)] group h-full"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-all duration-300"></div>

            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center mb-6 shadow-lg shadow-primary/20">
              <Combine className="w-7 h-7 text-white" />
            </div>

            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              PDF Merge/Split
              <span className="text-xs font-normal text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">Utility</span>
            </h2>
            <p className="text-gray-400 mb-6 leading-relaxed text-sm">
              Merge multiple PDF documents with custom ordering, or extract specific pages and ranges into a new PDF.
            </p>

            <ul className="space-y-2 text-xs text-gray-400">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                Merge multiple files instantly
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                Interactive file order arranger
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                Visual page extractor grid
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                Sequence range selections
              </li>
            </ul>
          </div>
        </ScrollCard>
      </div>
    </div>
  );
}
