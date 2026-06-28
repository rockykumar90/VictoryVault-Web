import { create } from 'zustand';

export const useAppStore = create((set) => ({
  // Core UI state
  currentMode: 'dashboard', // 'dashboard' | 'pdf-converter' | 'passport-generator'
  setMode: (mode) => set({ currentMode: mode }),

  // Document to PDF states
  pdfImages: [], // array of { id, file, url, croppedUrl, cropArea, name, rotation, width, height }
  addPdfImage: (img) => set((state) => ({ pdfImages: [...state.pdfImages, img] })),
  setPdfImages: (images) => set({ pdfImages: images }),
  removePdfImage: (id) => set((state) => ({ 
    pdfImages: state.pdfImages.filter(img => img.id !== id) 
  })),
  updatePdfImage: (id, updates) => set((state) => ({
    pdfImages: state.pdfImages.map(img => img.id === id ? { ...img, ...updates } : img)
  })),
  clearPdfImages: () => set({ pdfImages: [], pdfBrightness: 100, pdfContrast: 100 }),
  pdfBrightness: 100,
  pdfContrast: 100,
  setPdfBrightness: (val) => set({ pdfBrightness: val }),
  setPdfContrast: (val) => set({ pdfContrast: val }),

  // Passport Photo Generator states
  passportSrc: null,          // Original raw image object URL
  passportCropped: null,      // Cropped image URL (3.6x3.9 ratio)
  passportNoBg: null,         // Background-removed image URL
  passportFinal: null,        // Final edited & enhanced image URL
  passportBgColor: '#FFFFFF', // Selected background color
  passportBrightness: 100,    // 0 - 200
  passportContrast: 100,      // 0 - 200
  passportSmoothness: 0,      // 0 - 50
  passportCount: 5,           // 5, 10, 15, 20, etc.
  passportStatus: 'upload',   // 'upload' | 'crop' | 'bg-remove' | 'manual-edit' | 'enhancements' | 'layout'
  
  // Custom API keys for background removal
  removeBgApiKey: localStorage.getItem('remove_bg_api_key') || '',
  hfToken: localStorage.getItem('hf_token') || '',
  setRemoveBgApiKey: (key) => {
    localStorage.setItem('remove_bg_api_key', key);
    set({ removeBgApiKey: key });
  },
  setHfToken: (token) => {
    localStorage.setItem('hf_token', token);
    set({ hfToken: token });
  },

  setPassportSrc: (src) => set({ 
    passportSrc: src, 
    passportStatus: src ? 'crop' : 'upload' 
  }),
  setPassportCropped: (cropped) => set({ 
    passportCropped: cropped, 
    passportNoBg: cropped,
    passportStatus: 'manual-edit' 
  }),
  setPassportNoBg: (noBg) => set({ 
    passportNoBg: noBg,
    passportStatus: 'manual-edit'
  }),
  setPassportFinal: (final) => set({ 
    passportFinal: final 
  }),
  setPassportBgColor: (color) => set({ passportBgColor: color }),
  setPassportBrightness: (brightness) => set({ passportBrightness: brightness }),
  setPassportContrast: (contrast) => set({ passportContrast: contrast }),
  setPassportSmoothness: (smoothness) => set({ passportSmoothness: smoothness }),
  setPassportCount: (count) => set({ passportCount: count }),
  setPassportStatus: (status) => set({ passportStatus: status }),
  
  resetPassportStore: () => set({
    passportSrc: null,
    passportCropped: null,
    passportNoBg: null,
    passportFinal: null,
    passportBgColor: '#FFFFFF',
    passportBrightness: 100,
    passportContrast: 100,
    passportSmoothness: 0,
    passportCount: 5,
    passportStatus: 'upload'
  })
}));

