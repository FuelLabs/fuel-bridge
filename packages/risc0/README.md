# Risc0 prover prototype

This folder contains the code for proving a FuelVM state transition with Risc0 's framework for Zero Knowledge Proofs. This is an experimental iteration and changes are expected.

A Risc0 project is composed of at least two components:

- The ZKVM or guest, where a proof of correct execution of code is generated
- The host, which feeds inputs to the guest, and gets the result. This could be a local program or (saving some distances) a Solidity smart contract.

In this instance, the ZKVM / guest loads the FuelVM, then it takes an input consisting of an initial state, a batch of transactions, and a desired target state, and outputs if the initial state, when transactions are applied, is equal to the desired target.

Below, the contents of each subfolder, which follows a typical risc0 schema, is depicted:

## Host

Small program that allows to run the prover locally, ie. takes input locally, feeds them to the prover and fetches the result. At the moment it won't work because it needs some artifacts to initialize the proof.

## Methods

Contains ZKVMs that are able to provably execute their codes. Each ZKVM (or guest) is linked with an `Image ID`. Running a ZKVM guest generates an execution trace that is stamped with its image ID.

### Guest

This project contains a single guest that runs a FuelVM state transition. Code is loaded from the `core` folder.

## Core

Where most of the application logic that we want to run in the guest. Because executing a ZKVM guest run can be slow and expensive, this logic is separated from the guest to allow faster unit testing iterations.

## Tests

Folder where unit tests can be run.




