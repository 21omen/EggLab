# EggLab evaluation suite

Run the same brief, same references and same runtime/model configuration against v1 and v2. Where model nondeterminism exists, repeat generation-based cases and compare distributions or reviewer judgments rather than treating one seed as absolute truth.

## Evaluation loop
1. Freeze the test brief, inputs, model version, profile and expected constraints.
2. Capture the full run trace: skills loaded, references opened, tool calls, parameters, seeds, timing, errors, edits and QA output.
3. Grade intent understanding, skill selection, tool selection, constraint satisfaction, artifact quality, recovery behavior and delivery accuracy.
4. Compare against a human-reviewed expected outcome or rubric.
5. Add every material failure to regression-log.md.
6. Change one module or rule at a time and rerun affected cases plus the full critical set.

## Do not optimize only for token count
Track both context efficiency and actual outcome quality. A missing relevant skill is a worse failure than reading one extra small reference. Measure skill precision, skill recall, unnecessary loads, omitted required checks, tool success, revision count and final artifact quality.

## Suggested release gate
- 100% of critical hard constraints respected in the test set.
- No unauthorized destructive operation.
- No false claims that a tool/action succeeded.
- Every benchmark test loads required skill(s) or explicitly identifies why no skill is needed.
- No regression in required original command/workflow coverage.
- Human review accepts visual quality and task-specific QA.
