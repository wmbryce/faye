import { describe, it, expect } from "vitest";
import { reweighAudienceBudgets } from "@/lib/bandit/audience-budget";

const TOTAL = 10000; // $100

describe("reweighAudienceBudgets", () => {
  it("empty input returns empty", () => {
    expect(reweighAudienceBudgets([], TOTAL)).toEqual([]);
  });

  it("single audience gets the whole budget", () => {
    const out = reweighAudienceBudgets([{ audienceId: "a", meanScore: 0.5, currentBudgetCents: 5000 }], TOTAL);
    expect(out).toEqual([{ audienceId: "a", newBudgetCents: TOTAL }]);
  });

  it("equal scores → near-equal split", () => {
    const out = reweighAudienceBudgets([
      { audienceId: "a", meanScore: 0, currentBudgetCents: 5000 },
      { audienceId: "b", meanScore: 0, currentBudgetCents: 5000 },
    ], TOTAL);
    expect(Math.abs(out[0].newBudgetCents - 5000)).toBeLessThanOrEqual(2);
    expect(Math.abs(out[1].newBudgetCents - 5000)).toBeLessThanOrEqual(2);
  });

  it("dominant audience gains share but capped at +20% over current", () => {
    const out = reweighAudienceBudgets([
      { audienceId: "winner", meanScore: 1, currentBudgetCents: 5000 },
      { audienceId: "loser", meanScore: -1, currentBudgetCents: 5000 },
    ], TOTAL);
    const winner = out.find((x) => x.audienceId === "winner")!;
    const loser = out.find((x) => x.audienceId === "loser")!;
    // currentShare = 0.5; max allowed = 0.6 → 6000 cents (+ small rounding)
    expect(winner.newBudgetCents).toBeLessThanOrEqual(6005);
    expect(winner.newBudgetCents).toBeGreaterThan(5000); // gains some
    expect(loser.newBudgetCents).toBeGreaterThanOrEqual(3995); // bounded by -20% → 4000
  });

  it("preserves total budget within rounding tolerance", () => {
    const out = reweighAudienceBudgets([
      { audienceId: "a", meanScore: 0.4, currentBudgetCents: 3000 },
      { audienceId: "b", meanScore: -0.1, currentBudgetCents: 3000 },
      { audienceId: "c", meanScore: 0.2, currentBudgetCents: 4000 },
    ], TOTAL);
    const sum = out.reduce((a, x) => a + x.newBudgetCents, 0);
    expect(Math.abs(sum - TOTAL)).toBeLessThanOrEqual(3); // 3 audiences → max 3 cents rounding
  });

  it("zero current budgets fall back to equal share before reweighting", () => {
    const out = reweighAudienceBudgets([
      { audienceId: "a", meanScore: 0, currentBudgetCents: 0 },
      { audienceId: "b", meanScore: 0, currentBudgetCents: 0 },
    ], TOTAL);
    // currentShare defaults to 1/N=0.5; both equal; should split ~equally
    expect(Math.abs(out[0].newBudgetCents - 5000)).toBeLessThanOrEqual(5);
    expect(Math.abs(out[1].newBudgetCents - 5000)).toBeLessThanOrEqual(5);
  });

  it("losing audience drops but bounded at -20% of current share", () => {
    const out = reweighAudienceBudgets([
      { audienceId: "winner", meanScore: 2, currentBudgetCents: 2000 },
      { audienceId: "loser", meanScore: -2, currentBudgetCents: 8000 },
    ], TOTAL);
    const loser = out.find((x) => x.audienceId === "loser")!;
    // currentShare 0.8; min allowed 0.64 → 6400 cents
    expect(loser.newBudgetCents).toBeGreaterThanOrEqual(6300);
    expect(loser.newBudgetCents).toBeLessThan(8000);
  });
});
