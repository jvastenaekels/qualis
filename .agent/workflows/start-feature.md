---
description: Workflow to initialize a new feature or fix, ensuring guidelines are followed.
---

1. **Read Guidelines**:
   - Read the coding guidelines: `view_file .agent/coding_guidelines.md`
   - Read the development protocol: `view_file .agent/workflows/development-protocol.md`

2. **Contextualize**:
   - Check the current task status in `task.md`.
   - Review relevant existing implementation plans if any.

3. **Plan**:
   - Create or update `implementation_plan.md`.
   - Ensure the plan adheres to the **Quality Gate** (linting, tests) mentioned in the protocol.

4. **Execute**:
   - Proceed with the implementation, running `make ci` frequently as per the protocol.
