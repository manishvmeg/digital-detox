/**
 * public/js/audio.js
 * Synthesizes real-time focus soundscapes (Binaural Theta Beats & Pink Noise) using Web Audio API.
 * Pure mathematical generation, eliminating network dependencies.
 */

class AmbientSynthesizer {
  constructor() {
    this.audioContext = null;
    this.gainNode = null;
    
    // Nodes for Binaural Beats
    this.oscLeft = null;
    this.oscRight = null;
    this.pannerLeft = null;
    this.pannerRight = null;
    
    // Nodes for Pink Noise
    this.noiseNode = null;
    
    this.currentPlaying = null; // 'theta', 'pink', or null
    this.volume = 0.5;
  }

  initialize() {
    if (this.audioContext) return;
    
    // Cross-browser compatibility
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioContextClass();
    
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.setValueAtTime(this.volume, this.audioContext.currentTime);
    this.gainNode.connect(this.audioContext.destination);
  }

  setVolume(val) {
    this.volume = parseFloat(val);
    if (this.gainNode && this.audioContext) {
      this.gainNode.gain.setValueAtTime(this.volume, this.audioContext.currentTime);
    }
  }

  toggleThetaBeats() {
    this.initialize();
    
    if (this.currentPlaying === 'theta') {
      this.stop();
      return false;
    }
    
    this.stop(); // Stop anything else
    this.audioContext.resume();
    
    // Generate Binaural Beats (200Hz Left, 206Hz Right for a 6Hz Theta frequency)
    this.oscLeft = this.audioContext.createOscillator();
    this.oscRight = this.audioContext.createOscillator();
    
    this.oscLeft.type = 'sine';
    this.oscLeft.frequency.value = 200; // Carrier Frequency Left
    
    this.oscRight.type = 'sine';
    this.oscRight.frequency.value = 206; // Carrier Frequency Right (+6Hz Theta offset)
    
    // Panning (Split Left and Right)
    this.pannerLeft = this.audioContext.createStereoPanner ? this.audioContext.createStereoPanner() : null;
    this.pannerRight = this.audioContext.createStereoPanner ? this.audioContext.createStereoPanner() : null;
    
    if (this.pannerLeft && this.pannerRight) {
      this.pannerLeft.pan.setValueAtTime(-1, this.audioContext.currentTime);
      this.pannerRight.pan.setValueAtTime(1, this.audioContext.currentTime);
      
      this.oscLeft.connect(this.pannerLeft);
      this.pannerLeft.connect(this.gainNode);
      
      this.oscRight.connect(this.pannerRight);
      this.pannerRight.connect(this.gainNode);
    } else {
      // Fallback for older engines
      this.oscLeft.connect(this.gainNode);
      this.oscRight.connect(this.gainNode);
    }
    
    this.oscLeft.start(0);
    this.oscRight.start(0);
    
    this.currentPlaying = 'theta';
    return true;
  }

  togglePinkNoise() {
    this.initialize();
    
    if (this.currentPlaying === 'pink') {
      this.stop();
      return false;
    }
    
    this.stop();
    this.audioContext.resume();
    
    // Synthesize Pink Noise algorithmically
    const bufferSize = 4 * this.audioContext.sampleRate;
    const noiseBuffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    
    // Voss-McCartney Pink Noise algorithm
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      output[i] *= 0.11; // compensation
      b6 = white * 0.115926;
    }
    
    this.noiseNode = this.audioContext.createBufferSource();
    this.noiseNode.buffer = noiseBuffer;
    this.noiseNode.loop = true;
    
    this.noiseNode.connect(this.gainNode);
    this.noiseNode.start(0);
    
    this.currentPlaying = 'pink';
    return true;
  }

  stop() {
    if (this.oscLeft) {
      try { this.oscLeft.stop(); } catch (e) {}
      this.oscLeft = null;
    }
    if (this.oscRight) {
      try { this.oscRight.stop(); } catch (e) {}
      this.oscRight = null;
    }
    if (this.noiseNode) {
      try { this.noiseNode.stop(); } catch (e) {}
      this.noiseNode = null;
    }
    this.currentPlaying = null;
  }
}

// Export for module or global use
window.AmbientSynthesizer = AmbientSynthesizer;
