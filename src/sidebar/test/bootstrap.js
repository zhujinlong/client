// Expose the sinon assertions.
sinon.assert.expose(assert, { prefix: null });

// Patch extra assert helper methods
import { patch } from '../../test-util/assert-methods';
patch(assert);

// Configure Enzyme for UI tests.
import 'preact/debug';

import { configure } from 'enzyme';
import { Adapter } from 'enzyme-adapter-preact-pure';

configure({ adapter: new Adapter() });

// Make all the icons that are available for use with `SvgIcon` in the actual
// app available in the tests. This enables validation of icon names passed to
// `SvgIcon`.
import sidebarIcons from '../icons';
import annotatorIcons from '../../annotator/icons';
import { registerIcons } from '../../shared/components/svg-icon';
registerIcons({
  ...sidebarIcons,
  ...annotatorIcons,
});

const addedScripts = new Set();

const getFilename = src => {
  const m = src.match(/[^/]*\.(js|coffee)/);
  return m ? m[0] : src;
};

const mo = new MutationObserver(mutationList => {
  for (let entry of mutationList) {
    if (entry.type === 'childList') {
      entry.addedNodes.forEach(r => {
        if (r.localName === 'script') {
          const src = r.src;
          const filename = getFilename(src);
          if (src) {
            addedScripts.add(src);
            console.log(
              'Added script with src',
              filename,
              'count',
              addedScripts.size
            );
            r.addEventListener('load', () => {
              console.log('Script loaded', filename);
            });
            r.addEventListener('error', () => {
              console.log('Script errored', filename);
            });
          } else {
            console.log('Added anonymous script', r.textContent);
          }
        }
      });

      entry.removedNodes.forEach(r => {
        if (addedScripts.has(r)) {
          console.log('Removed script with src ', getFilename(r.src));
        }
      });
    }
  }
});
mo.observe(document.body, { childList: true });
