#!/usr/bin/env node
// Deploy-build gate for the Formal Verification paragraph of
// docs/Dominus_OS_White_Paper_v1_1_Addendum.md. vercel.json runs this as the
// buildCommand, so a deploy fails unless it passes.
//
// The paragraph publishes what the TLC model checker checked and how many
// distinct states it explored. Those claims are checked in the os-evolution
// repo, which holds the TLA+ specs and TLC:
//
//   npm run verify:published -- <this checkout>
//
// That runs TLC, checks this addendum against the log TLC has just written,
// and on PASS writes docs/formal-verification-receipt.json naming the sha256
// of the exact addendum it checked. This script refuses the build unless that
// receipt exists, says PASS from a clean gate tree, and matches the addendum
// byte for byte. Editing the addendum after the gate ran therefore fails the
// deploy until the gate is run again and the new receipt is committed.
//
// Exit 0 = the receipt matches; 1 = it does not.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADDENDUM = 'docs/Dominus_OS_White_Paper_v1_1_Addendum.md';
const RECEIPT = 'docs/formal-verification-receipt.json';
const FIX = 'Run `npm run verify:published -- <dominus-os checkout>` in os-evolution and commit the receipt it writes.';

const fail = (why) => {
  console.error(`FAIL: ${why}`);
  console.error(FIX);
  process.exit(1);
};

let receipt;
try {
  receipt = JSON.parse(fs.readFileSync(path.join(ROOT, RECEIPT), 'utf8'));
} catch (e) {
  fail(`${RECEIPT} is missing or unreadable (${e.message})`);
}
const addendum = fs.readFileSync(path.join(ROOT, ADDENDUM));
const actual = crypto.createHash('sha256').update(addendum).digest('hex');

if (receipt.verdict !== 'PASS') fail(`the receipt's verdict is ${JSON.stringify(receipt.verdict)}, not "PASS"`);
if (receipt.verify_specs_exit !== 0) fail(`the receipt's verify_specs_exit is ${JSON.stringify(receipt.verify_specs_exit)}, not 0`);
if (receipt.published_file !== ADDENDUM) fail(`the receipt checked ${JSON.stringify(receipt.published_file)}, not ${ADDENDUM}`);
if (receipt.gate_tree_clean !== true) fail('the gate ran on an os-evolution tree with uncommitted changes, so the commit it names is not the gate that ran');
if (!/^[0-9a-f]{40}$/.test(receipt.gate_commit || '')) fail('the receipt names no os-evolution commit');
if (receipt.published_sha256 !== actual) {
  fail(`${ADDENDUM} has changed since the gate checked it (receipt ${receipt.published_sha256}, file ${actual})`);
}
console.log(`PASS: ${ADDENDUM} (sha256 ${actual}) was checked against a live TLC run by os-evolution ${receipt.gate_commit} at ${receipt.checked_at}; distinct states ${JSON.stringify(receipt.tlc_distinct_states)}`);
