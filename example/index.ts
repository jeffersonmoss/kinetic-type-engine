// Remotion entry point of the example (its own bundle, so its song configuration is the only one in it).
// Render: npx remotion render example/index.ts KineticTypeExample out/kinetic-type-example.mp4
import {registerRoot} from 'remotion';
import {Root} from './Root';

registerRoot(Root);
