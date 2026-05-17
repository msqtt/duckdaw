const fs = require('fs');
const lines = fs.readFileSync('src/components/DAW/ArrangeView.tsx', 'utf8').split('\n');
lines.splice(9, 392); // Remove lines 10-401 (0-indexed 9 to 400 = 392 lines)
const imports = `import { TrackHeader, currentDragTrackSourceIndex, setTrackDragSource } from './TrackHeader';
import { ClipItem, currentDragContext, setDragContext } from './ClipItem';\n`;
fs.writeFileSync('src/components/DAW/ArrangeView.tsx', lines.slice(0, 9).join('\n') + '\n' + imports + lines.slice(9).join('\n'));
