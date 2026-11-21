import {ingest, ingestUsage} from './ingest';

export function run([command, ...args]: string[], beatWorker: string) {
  try {
    if (command === 'ingest') ingest(args, beatWorker);
    else if (!command || command === '--help' || command === '-h') console.log(ingestUsage);
    else throw new Error(`Unknown command: ${command}\n${ingestUsage}`);
  } catch (error) {
    console.error(`kte: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}
