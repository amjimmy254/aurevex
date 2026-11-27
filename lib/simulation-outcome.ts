import { randomInt } from "node:crypto";

export const DEFAULT_SIMULATION_WIN_PROBABILITY = 20;

export type SimulationOutcome = {
  won: boolean;
  winProbability: number;
  simulationOnly: true;
};

export function assignSimulationOutcome(
  winProbability = DEFAULT_SIMULATION_WIN_PROBABILITY
): SimulationOutcome {
  if (
    !Number.isInteger(winProbability) ||
    winProbability < 0 ||
    winProbability > 100
  ) {
    throw new Error("Win probability must be from 0 to 100.");
  }

  return {
    won: randomInt(100) < winProbability,
    winProbability,
    simulationOnly: true
  };
}
