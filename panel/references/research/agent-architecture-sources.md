# Agent architecture research

Accessed/reviewed for this v2 architecture package on 2026-11-12. These sources inform general design patterns only.

1. **Anthropic — Effective Context Engineering for AI Agents** (2025-09-29)  
   https://www.anthropic.com/research/effective-context-engineering-for-ai-agents  
   Relevance: context selection, just-in-time retrieval, context-window management and structured context assembly.

2. **OpenAI — A Practical Guide to Building Agents** (2026-01-15)  
   https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/  
   Relevance: agent instructions, tool design, orchestration, model choice and guardrails. Prefer a single agent with clear tools until complexity genuinely requires multiple agents.

3. **Agent Skills — Open Specification**  
   https://github.com/agentskills/agentskills/blob/main/docs/specification.mdx  
   Relevance: progressive loading of skill metadata and instructions, with supporting references loaded as required.

4. **OpenAI — Agent Evals**  
   https://developers.openai.com/api/docs/guides/agent-evals  
   Relevance: trace-based evaluation, graders and repeatable agent workflow evaluation.

5. **Anthropic — Effective Harnesses for Long-Running Agents**  
   https://www.anthropic.com/research/effective-harnesses-for-long-running-agents  
   Relevance: durable task state, checkpoints and verification across longer tasks.

## Interpretation for EggLab
- Keep one central creative director and use specialized skills as knowledge modules.
- Separate permanent rules, task instructions, detailed references and temporary job state.
- Load only task-relevant modules, but keep universal constraints always active.
- Use traces and regression benchmarks before changing system behavior.
- The runtime must actually implement read-on-demand loading; merely storing files in folders does not reduce model context.
