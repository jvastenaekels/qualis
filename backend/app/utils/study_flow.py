# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""State-machine validation for participant flow steps.

Steps: 1=consent, 2=presort, 3=rough sort, 4=fine sort, 5=post-sort.
When ``rough_sort_enabled=False``, step 3 is skipped and the canonical
forward sequence is 1 -> 2 -> 4 -> 5.

Backward transitions are always allowed (resume / replay scenarios).
"""

from __future__ import annotations


class InvalidStepTransition(ValueError):
    """Raised when a step transition is not permitted by the study's flow."""


def enabled_steps(rough_sort_enabled: bool) -> tuple[int, ...]:
    """Return the enabled persistence step numbers for a study config."""
    if rough_sort_enabled:
        return (1, 2, 3, 4, 5)
    return (1, 2, 4, 5)


def validate_step_transition(
    *,
    current_step: int,
    target_step: int,
    rough_sort_enabled: bool,
) -> None:
    """Raise ``InvalidStepTransition`` if the target step is not reachable.

    The /progress endpoint is fire-and-forget: the frontend may report any
    forward step it has reached. We only reject targets that are not
    structurally enabled for the study (e.g. step 3 when rough_sort_enabled
    is False — that step does not exist in the participant flow).

    Backward and idempotent transitions are always allowed (resume / replay).
    """
    if target_step <= current_step:
        return
    allowed = enabled_steps(rough_sort_enabled)
    if target_step not in allowed:
        raise InvalidStepTransition(
            f"Step {target_step} is not enabled for this study (allowed: {allowed})"
        )
