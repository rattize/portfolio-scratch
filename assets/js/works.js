import { mountArtwork } from './artwork.js';

// Hand-author the approved poster, description, start button and controls in HTML.
// Without that content, this module does not create or advertise a work.
for (const frame of document.querySelectorAll('[data-model]'))
  mountArtwork(frame);
