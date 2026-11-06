import { readFile } from 'node:fs/promises';
import ts from 'typescript';
export async function loadRoad(isSincheon = false) {
  let source = await readFile(new URL('../../src/game/road.ts', import.meta.url), 'utf8');
  for (const [name, file] of [['raw', 'dalgu'], ['sincheon', 'sincheon']]) {
    const json = await readFile(new URL(`../../src/data/${file}.json`, import.meta.url), 'utf8');
    source = source.replace(`import ${name} from '../data/${file}.json';`, `const ${name} = ${json};`);
  }
  source = source.replace("import { IS_SINCHEON } from './roadSelection';", `const IS_SINCHEON = ${isSincheon};`);
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  return { road: await import(url), url };
}
