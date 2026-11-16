// Remotion entry point of the parity fixture (its own bundle, so its song configuration is the only one in it).
// Render: npx remotion render fixtures/ipo-proof/index.ts IpoProofV3 out/ipo-proof-v3.mp4
import {registerRoot} from 'remotion';
import {Root} from './Root';

registerRoot(Root);
