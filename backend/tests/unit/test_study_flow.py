# Qualis - Open-source platform for conducting Q-methodology research
# Copyright (C) 2025 Julien Vastenekels
# Licensed under the GNU Affero General Public License v3.0 or later.

"""Unit tests for app.utils.study_flow state-machine helpers."""

import pytest

from app.utils.study_flow import (
    InvalidStepTransition,
    enabled_steps,
    validate_step_transition,
)


def test_enabled_steps_with_rough() -> None:
    assert enabled_steps(rough_sort_enabled=True) == (1, 2, 3, 4, 5)


def test_enabled_steps_without_rough() -> None:
    assert enabled_steps(rough_sort_enabled=False) == (1, 2, 4, 5)


def test_step_3_rejected_when_rough_disabled() -> None:
    with pytest.raises(InvalidStepTransition):
        validate_step_transition(
            current_step=2, target_step=3, rough_sort_enabled=False
        )


def test_step_3_allowed_when_rough_enabled() -> None:
    validate_step_transition(
        current_step=2, target_step=3, rough_sort_enabled=True
    )


def test_step_4_from_step_2_when_rough_disabled() -> None:
    validate_step_transition(
        current_step=2, target_step=4, rough_sort_enabled=False
    )


def test_step_4_from_step_2_rejected_when_rough_enabled() -> None:
    with pytest.raises(InvalidStepTransition):
        validate_step_transition(
            current_step=2, target_step=4, rough_sort_enabled=True
        )


def test_backward_transitions_always_allowed() -> None:
    validate_step_transition(
        current_step=4, target_step=2, rough_sort_enabled=True
    )
    validate_step_transition(
        current_step=4, target_step=2, rough_sort_enabled=False
    )


def test_same_step_idempotent() -> None:
    validate_step_transition(
        current_step=3, target_step=3, rough_sort_enabled=True
    )
    validate_step_transition(
        current_step=4, target_step=4, rough_sort_enabled=False
    )


def test_step_5_reachable_in_both_modes() -> None:
    validate_step_transition(
        current_step=4, target_step=5, rough_sort_enabled=True
    )
    validate_step_transition(
        current_step=4, target_step=5, rough_sort_enabled=False
    )


def test_step_2_from_step_1_in_both_modes() -> None:
    validate_step_transition(
        current_step=1, target_step=2, rough_sort_enabled=True
    )
    validate_step_transition(
        current_step=1, target_step=2, rough_sort_enabled=False
    )


def test_invalid_transition_message_includes_allowed_steps() -> None:
    with pytest.raises(InvalidStepTransition) as exc_info:
        validate_step_transition(
            current_step=2, target_step=3, rough_sort_enabled=False
        )
    assert "(1, 2, 4, 5)" in str(exc_info.value)
