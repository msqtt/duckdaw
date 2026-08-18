import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const deployment = {
  commit: __DUCKDAW_COMMIT__,
  context: __DUCKDAW_CONTEXT__,
  branch: __DUCKDAW_BRANCH__,
};
document.documentElement.dataset.duckdawCommit = deployment.commit;
document.documentElement.dataset.duckdawContext = deployment.context;
document.documentElement.dataset.duckdawBranch = deployment.branch;
for (const [name, content] of Object.entries(deployment)) {
  const meta = document.createElement('meta');
  meta.name = `duckdaw-${name}`;
  meta.content = content;
  document.head.append(meta);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
