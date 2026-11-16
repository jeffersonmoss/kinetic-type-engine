// Font loading for the example (browser side only; the validator never imports it).
import {loadFont as loadAnton} from '@remotion/google-fonts/Anton';
import {loadFont as loadDMSerif} from '@remotion/google-fonts/DMSerifDisplay';
import {loadFont as loadBarlowCondensed} from '@remotion/google-fonts/BarlowCondensed';

loadAnton('normal', {weights: ['400'], subsets: ['latin']});
loadDMSerif('italic', {weights: ['400'], subsets: ['latin']});
loadBarlowCondensed('normal', {weights: ['700'], subsets: ['latin']});
