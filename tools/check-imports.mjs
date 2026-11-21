import {isBuiltin} from 'node:module';
import {dirname, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {API} from 'typescript/unstable/sync';
import {
  SyntaxKind, isCallExpression, isExportDeclaration, isExternalModuleReference, isIdentifier,
  isImportDeclaration, isImportEqualsDeclaration, isImportTypeNode, isLiteralTypeNode,
} from 'typescript/unstable/ast';

const dependencies = {
  engine: ['react'],
  song: [],
  context: ['engine'],
  effects: ['engine', 'context'],
  score: ['song', 'effects'],
  compile: ['score', 'effects', 'song', 'engine', 'context'],
  check: ['compile', 'score', 'song', 'effects', 'engine', 'context', 'react-dom/server'],
  host: ['compile', 'score', 'song', 'engine', 'context', 'react', 'remotion'],
  cli: [],
};

function allowed(owner, file, target, typeOnly, names) {
  const module = target.split('/')[0];
  const path = target.replace(/\.[cm]?[jt]sx?$/, '');
  if (owner === 'cli' || module === owner) return true;
  if (owner === 'engine' && target === 'remotion') {
    return file === 'engine/time.ts' && names?.join() === 'useCurrentFrame';
  }
  if (owner === 'context') {
    if (target === 'react') return file === 'context/EngineScope.tsx';
    if (module === 'engine') {
      return typeOnly || (path === 'engine/scope' && file === 'context/EngineScope.tsx')
        || (path === 'engine/config' && file === 'context/legacyBridge.ts' && names?.join() === 'configureEngine');
    }
  }
  if (owner === 'effects' && module === 'engine') return typeOnly;
  if (owner === 'score' && module === 'song') return typeOnly;
  if (file === 'check/golden.mjs' && (target === 'esbuild' || isBuiltin(target))) return true;
  return dependencies[owner].includes(Object.hasOwn(dependencies, module) ? module : target);
}

function inspectFile(source, root, errors) {
  const file = relative(root, source.fileName).split(sep).join('/');
  const owner = file.split('/')[0];
  if (!Object.hasOwn(dependencies, owner)) return false;

  const inspectImport = (location, specifier, typeOnly = false, names) => {
    let target = specifier;
    if (target?.startsWith('kte/')) target = target.slice(4);
    else if (target?.startsWith('.') || target?.startsWith('/')) {
      target = relative(root, resolve(dirname(source.fileName), target)).split(sep).join('/');
    }
    if ((target && allowed(owner, file, target, typeOnly, names)) || owner === 'cli') return;
    const {line} = source.getLineAndCharacterOfPosition(location);
    errors.push(`${file}:${line + 1}: ${owner} cannot import ${specifier ?? 'a computed module specifier'}`);
  };

  const text = (node) => node && (node.kind === SyntaxKind.StringLiteral || node.kind === SyntaxKind.NoSubstitutionTemplateLiteral)
    ? node.text : undefined;
  const visit = (node) => {
    if (isImportDeclaration(node)) {
      const clause = node.importClause;
      const elements = clause?.namedBindings?.elements ?? [];
      const values = elements.filter((element) => !element.isTypeOnly);
      const typeOnly = clause?.phaseModifier === SyntaxKind.TypeKeyword
        || (!clause?.name && elements.length > 0 && !values.length);
      const names = !clause?.name && elements.length ? values.map((element) => (element.propertyName ?? element.name).text) : undefined;
      inspectImport(node.getStart(source), text(node.moduleSpecifier), typeOnly, names);
    } else if (isExportDeclaration(node) && node.moduleSpecifier) {
      const elements = node.exportClause?.elements ?? [];
      const values = elements.filter((element) => !element.isTypeOnly);
      inspectImport(node.getStart(source), text(node.moduleSpecifier), node.isTypeOnly || (elements.length > 0 && !values.length));
    } else if (isImportTypeNode(node)) {
      inspectImport(node.getStart(source), isLiteralTypeNode(node.argument) ? text(node.argument.literal) : undefined, true);
    } else if (isImportEqualsDeclaration(node) && isExternalModuleReference(node.moduleReference)) {
      inspectImport(node.getStart(source), text(node.moduleReference.expression), node.isTypeOnly);
    } else if (isCallExpression(node) && (node.expression.kind === SyntaxKind.ImportKeyword
      || (isIdentifier(node.expression) && node.expression.text === 'require'))) {
      inspectImport(node.getStart(source), text(node.arguments[0]));
    }
    node.forEachChild(visit);
  };
  visit(source);
  for (const ref of source.referencedFiles) {
    inspectImport(ref.pos, resolve(dirname(source.fileName), ref.fileName), true);
  }
  for (const ref of source.typeReferenceDirectives) inspectImport(ref.pos, ref.fileName, true);
  return true;
}

export function checkImports(root) {
  const api = new API({cwd: root});
  try {
    const tsconfig = join(root, 'tsconfig.json');
    const snapshot = api.updateSnapshot({openProject: tsconfig});
    try {
      const {program} = snapshot.getProject(tsconfig);
      const errors = [];
      let files = 0;
      for (const file of program.getSourceFileNames()) {
        if (!Object.hasOwn(dependencies, relative(root, file).split(sep)[0])) continue;
        if (inspectFile(program.getSourceFile(file), root, errors)) files++;
      }
      return {errors, files};
    } finally {
      snapshot.dispose();
    }
  } finally {
    api.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
  const {errors, files} = checkImports(root);
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`Import rules passed across ${files} source files.`);
  }
}
