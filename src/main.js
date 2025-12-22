import { UIManager } from './ui/UIManager.js';
import { AsciiProcessor } from './core/AsciiProcessor.js';

console.log('ASCII Architect initializing...');

const processor = new AsciiProcessor();
const ui = new UIManager(processor);

ui.init();
