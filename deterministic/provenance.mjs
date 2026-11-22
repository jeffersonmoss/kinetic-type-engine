// Render provenance Markdown writer (rulebook 18.7).
// Strictly avoids em-dashes in all generated Markdown (18.6.1).
import fs from 'node:fs';
import path from 'node:path';

function readGitCommit(repoDir) {
  try {
    const headPath = path.join(repoDir, '.git', 'HEAD');
    const head = fs.readFileSync(headPath, 'utf8').trim();
    if (head.startsWith('ref:')) {
      const refRel = head.slice(4).trim();
      const refPath = path.join(repoDir, '.git', refRel);
      if (fs.existsSync(refPath)) {
        return `${fs.readFileSync(refPath, 'utf8').trim().slice(0, 12)} (${refRel}, working tree uncommitted)`;
      }
      return `${refRel} (working tree uncommitted)`;
    }
    return `${head.slice(0, 12)} (working tree uncommitted)`;
  } catch {
    return 'unknown';
  }
}

function cleanCell(text) {
  return String(text ?? '')
    .replace(/\u2014/g, ' - ')
    .replace(/\|/g, '/')
    .replace(/\r?\n/g, '; ');
}

function fmtNum(n, digits = 3) {
  return typeof n === 'number' && Number.isFinite(n) ? n.toFixed(digits) : 'n/a';
}

export function renderProvenanceMarkdown({
  clipName,
  commandLine,
  title,
  salt,
  buildIndex,
  flags,
  repoDir,
  buildLog,
  medianTerms,
  medianScore,
  divergences = [],
}) {
  const commit = readGitCommit(repoDir);
  const lines = [];
  lines.push(`# Render provenance: ${cleanCell(clipName)}`);
  lines.push('');
  lines.push('## Build header');
  lines.push('');
  lines.push(`- **Clip**: ${cleanCell(clipName)}`);
  lines.push(`- **Command**: \`${cleanCell(commandLine)}\``);
  lines.push(`- **Title**: ${cleanCell(title)}`);
  lines.push(`- **Salt**: ${cleanCell(salt)}`);
  lines.push(`- **Chosen build index**: ${buildIndex}`);
  lines.push(`- **Flags**: \`${cleanCell(JSON.stringify(flags))}\``);
  lines.push(`- **Git commit**: ${cleanCell(commit)}`);
  lines.push(`- **Pipeline**:`);
  lines.push(`  1. Words and tiers: \`plan_words.mjs:planWords\``);
  lines.push(`  2. Palette, fonts, and styles: \`style.mjs:checkPalette\`, \`style.mjs:checkSlots\`, \`style.mjs:assignStyles\`, \`style.mjs:resolvePlaqueWordStyles\``);
  lines.push(`  3. Plaque composition: \`compose_plaques.mjs:composePlaques\``);
  lines.push(`  4. Trail geometry and look-ahead: \`plan_trail.mjs:planTrail\``);
  lines.push(`  5. Camera, visibility, and reveal: \`camera.mjs:planCameraAndVisibility\`, \`interp.js:KT_INTERP\``);
  lines.push(`  6. Hard checks and score: \`checks.mjs:evaluateScene\``);
  lines.push(`  7. Best-of-N and pins: \`build_best.mjs:buildBest\``);
  lines.push('');
  lines.push('## Per-shot decisions');
  lines.push('');
  lines.push('| Shot | Words (roles) | Boundary | Intended rule decision | Changed on its own | Final decision | Frames (land / accent / on / off) | Code path |');
  lines.push('|---|---|---|---|---|---|---|---|');

  for (const s of buildLog.shots) {
    const wordsCol = s.words.map(w => `${w.text}(${w.role})`).join(' ');
    const bndFlags = [
      s.boundary ?? 'start',
      s.isSetPiece ? 'set-piece' : null,
      s.isEcho ? 'echo' : null,
      s.motifOf != null ? `motif:${s.motifOf}` : null,
      s.parallelOf != null ? `parallel:${s.parallelOf}` : null,
    ].filter(Boolean).join(', ');

    const intB = s.intendedBoundary
      ? `fold=${s.intendedBoundary.fold}, verb=${s.intendedBoundary.verb ?? 'drawn'}, edge=${s.intendedBoundary.edge}, sign=${s.intendedBoundary.sign}, align=${s.intendedBoundary.alignMode}, gap=${fmtNum(s.intendedBoundary.gap, 1)}`
      : 'start';
    const intP = `layout=${s.intendedPlaque.layout}, slots=${(s.intendedPlaque.slots ?? []).join('/')}, arr=${(s.intendedPlaque.arrangements ?? []).join('/')}, styles=${s.styles.primary}/${s.styles.secondary}`;
    const intendedCol = `${intB}; ${intP}${s.pinned ? ' [pinned]' : ''}`;

    const changedCol = s.changesOnItsOwn.length
      ? s.changesOnItsOwn.map(c => `[${c.id}] ${c.detail}`).join('; ')
      : 'none';

    const finB = s.finalBoundary
      ? `fold=${s.finalBoundary.fold}, verb=${s.finalBoundary.verb}, edge=${s.finalBoundary.edge}, sign=${s.finalBoundary.sign}, align=${s.finalBoundary.alignMode}, gap=${fmtNum(s.finalBoundary.gap, 1)}`
      : 'start';
    const finP = `layout=${s.finalPlaque.layout}, slots=${s.finalPlaque.slots.join('/')}, arr=${s.finalPlaque.arrangements.join('/')}, surface=${s.finalPlaque.surface}`;
    const finalCol = `${finB}; ${finP}`;

    const accStr = s.frames.accents.length
      ? s.frames.accents.map(([a, b, t]) => `${t}:${a}-${b}`).join(',')
      : 'none';
    const offStr = s.frames.off != null
      ? `${s.frames.off}(${s.frames.offOnScreen ? 'on-screen' : 'off-screen'})`
      : 'stays-on';
    const revStr = s.frames.reveal_on != null ? `, rev=${s.frames.reveal_on}` : '';
    const framesCol = `land=${s.frames.landings.join(',')}; acc=${accStr}; on=${s.frames.on}; off=${offStr}${revStr}`;

    const pathCol = s.codePaths.join('; ');
    lines.push(`| ${s.shot} | ${cleanCell(wordsCol)} | ${cleanCell(bndFlags)} | ${cleanCell(intendedCol)} | ${cleanCell(changedCol)} | ${cleanCell(finalCol)} | ${cleanCell(framesCol)} | ${cleanCell(pathCol)} |`);
  }

  lines.push('');
  lines.push('## Reveal');
  lines.push('');
  const rev = buildLog.reveal;
  lines.push(`- **Chosen direction**: ${cleanCell(rev.chosen.name)} (dist=${fmtNum(rev.chosen.dist, 1)}, coverShare=${fmtNum(rev.chosen.coverShare * 100, 1)}%, facing=${fmtNum(rev.chosen.facing, 3)}, metric=${fmtNum(rev.chosen.metric, 1)}, passes=${rev.chosen.passes})`);
  lines.push(`- **Reveal frames**: ${rev.f0} to ${rev.f1} (still hold until frame ${buildLog.frames - 1})`);
  if (rev.refused.length) {
    lines.push(`- **Refused higher-ranked directions**:`);
    for (const r of rev.refused) {
      lines.push(`  - ${cleanCell(r.name)}: metric=${fmtNum(r.metric, 1)}, coverShare=${fmtNum(r.coverShare * 100, 1)}%, reason=${cleanCell(r.reason)}`);
    }
  } else {
    lines.push(`- **Refused higher-ranked directions**: none (top-ranked direction passed)`);
  }

  lines.push('');
  lines.push('## Score vs median of 200');
  lines.push('');
  lines.push('| Term | This build | Median of 200 |');
  lines.push('|---|---|---|');
  lines.push(`| **total score** | ${fmtNum(buildLog.score, 4)} | ${fmtNum(medianScore, 4)} |`);
  for (const [k, v] of Object.entries(buildLog.terms)) {
    lines.push(`| ${cleanCell(k)} | ${fmtNum(v, 4)} | ${fmtNum(medianTerms?.[k], 4)} |`);
  }

  lines.push('');
  lines.push('## Hard checks');
  lines.push('');
  lines.push(`- **All hard checks passed**: ${buildLog.passed ? 'YES' : 'NO'}`);
  if (buildLog.failedChecks.length) {
    lines.push(`- **Failed checks**: ${buildLog.failedChecks.join(', ')}`);
    for (const name of buildLog.failedChecks) {
      const details = buildLog.checkFailures?.[name] ?? [];
      lines.push(`  - ${name}: ${cleanCell(details.slice(0, 3).join(' | '))}`);
    }
  } else {
    lines.push(`- **Checks passed**: all hard checks passed`);
  }

  if (flags.pins) {
    lines.push('');
    lines.push('## Fork divergences from Clip A pins');
    lines.push('');
    if (!divergences.length) {
      lines.push('- Zero divergences: every shot kept Clip A\'s pinned choices.');
    } else {
      lines.push(`- Diverged shots (${divergences.length}):`);
      for (const d of divergences) {
        lines.push(`  - Shot ${d.shot}: ${cleanCell(d.reasons.join('; '))}`);
      }
    }
  }

  // Spec 50: every joint (word, primitive, host, edge, mode, frames, candidates rejected and why).
  if (buildLog.joints) {
    const J = buildLog.joints;
    lines.push('');
    lines.push('## Attached word transitions (joints)');
    lines.push('');
    lines.push(`- Forced repeats: ${J.forcedRepeats}. Repeat runs: ${J.runs.map(r => r.join(' ')).join('; ') || 'none'}.`);
    if (J.pinDivergences?.length) lines.push(`- Pins not used: ${cleanCell(J.pinDivergences.map(d => `${d.text} ${d.pinned} (${d.why})`).join('; '))}`);
    for (const n of J.notes ?? []) lines.push(`- Note: ${cleanCell(n)}`);
    lines.push('');
    lines.push('| # | Word | Track | Primitive | Family | Host | Edge | Mode | Frames | Run | Forced | Rejected candidates |');
    lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const j of J.list) {
      const rej = (j.rejected ?? []).map(r => `${r.prim}: ${r.why}`).join('; ');
      lines.push(`| ${j.index + 1} | ${cleanCell(j.text)} | ${j.track} | ${j.prim} | ${j.family} | ${j.host ?? ''} | ${j.edge ?? ''} | ${j.mode} | ${j.f0} to ${j.f1} | ${j.run != null ? j.run + 1 : ''} | ${j.forced_repeat ? 'yes' : ''} | ${cleanCell(rej)} |`);
    }
  }

  lines.push('');
  return lines.join('\n').replace(/\u2014/g, ' - ');
}
