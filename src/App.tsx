/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy } from 'react';

// Lazy load the huge DAW part (Tone.js, etc.)
const DAWApp = lazy(() => import('./DAWApp'));

export default function App() {
  return (
    <Suspense fallback={null}>
      <DAWApp />
    </Suspense>
  );
}
