# type: ignore
# ruff: noqa: F821, D100
"""Vulture whitelist to suppress false positives for dynamic usage.

This file whitelists items that are used dynamically by:
1. FastAPI for route endpoints and middleware.
2. SQLAlchemy for ORM relationships and properties.
3. Pydantic for validation and config hooks.
4. Testing utilities.
"""

# --- app/main.py (FastAPI entry points) ---
health_check
serve_spa
read_root

# --- app/core/config.py (Settings & Validation) ---
API_PREFIX
IP_HASH_SALT
assemble_db_url
cls
model_config
effective_emails_from_name
AUDIO_MAX_DURATION_SECONDS

# --- app/models.py (SQLAlchemy Models) ---
individual
limited
config
joined_at
memberships
symmetry_lock
free  # DistributionMode.free enum member, referenced at the wire boundary
flexible  # DistributionMode.flexible enum member, referenced at the wire boundary
recruitment_links
requires_password
ui_labels
consent_accept
consent_decline
statement
random_seed
recruitment_token
start_count
Invitation
accepted_at
participant_count
audio_recordings
s3_bucket
draft_responses
concourse_tags
accepted
rejected
creator
versions
comments
translations_snapshot
tag_ids_snapshot
changed_by
changed_at
comment_count

# --- app/routers/ (FastAPI endpoints) ---
# admin/exports.py
export_csv
export_pqmethod
export_r_kit
get_study_dump
export_participant_csv
export_participant_json
export_participant_audio
get_research_package

# admin/invitations.py
verify_invitation
accept_invitation

# admin/recruitment.py
list_study_links
create_recruitment_links
revoke_recruitment_link

# admin/studies.py
list_studies
validate_study
change_study_state
delete_study
get_participant
discard_participant
list_study_participants
validate_slug
languages
grid_range
has_presort
has_postsort
valid
export_study_config
validate_study_import
import_study_config
clear_test_runs
clear_all_participants
get_study_storage_usage
import_from_concourse
check_stale_statements
sync_statement_from_concourse
sync_all_stale_statements
import_items_from_text
list_item_versions
list_item_comments
create_item_comment

# admin/analysis.py
get_eigenvalues
run_factor_analysis

# audio.py
upload_audio
delete_audio_recording
get_audio_url

# admin/users.py
list_users
create_user
delete_user

# admin/projects.py
list_projects
create_project
get_project
update_project
list_project_members
update_project_member
remove_project_member
delete_project
create_invitation

# auth.py
read_users_me
login_for_access_token
register_user
update_user_me
change_password
setup_totp
enable_totp
disable_totp

# logs.py
report_log

# participants.py
update_progress
save_draft
resume_session

# submissions.py
submit_study
unlock_study

# test.py
init_test_db
seed_test_data
add_test_member
cleanup_test_data
cleanup_all_test_data

# --- app/schemas.py (Pydantic models) ---
token_type
requires_2fa
temp_token
model_config
joined_at
user_role
logo_url
icon
color
consent_accept
consent_decline
ui_labels
accent_color
primary_color
partners
symmetry_lock
_.check_grid_symmetry
recruitment_links
requires_password
median_duration_seconds
_.validate_qsort_structure
_.validate_token
_.validate_answers_dict
recruitment_token
InvitationCreate
start_count
qr_code_uri

# --- app/schema_validation.py ---
SchemaValidationError

# --- app/services/ ---
_.start_count
delete_link
get_storage_service
get_study_sort_data

# --- app/utils/script_utils.py ---
sync_study_from_file

# --- Pydantic Validators (app/schemas.py) ---
validate_full_name
validate_title
validate_strings
validate_trans_strings
validate_text
validate_code
validate_not_blank
validate_comment
validate_reason
validate_name
pre_instruction
statement_code
url_expires_at

# Analysis schemas (app/schemas.py)
validate_draft
source_deleted
current_translations
concourse_translations

# Draft/Resume schemas (app/schemas.py)
# ResumeResponse / ConsentResponse fields
language
resume_code
ConsentResponse

# app/resume_codes.py
generate_unique_resume_code

# app/limiter.py
_get_real_ip

# Analysis schemas (app/schemas.py)
validate_extraction
validate_rotation
validate_flagging
validate_distinct  # ManualRotation field validator (judgmental rotation)
validate_manual_rotations_consistency  # AnalysisRequest model validator (judgmental rotation)
angle_deg  # ManualRotation field, consumed by service via dict access
bootstrap_result  # AnalysisRun JSON column, written by router and read in tests/UI
ci_lower  # Bootstrap stability — Pydantic field + TypedDict, consumed via JSON
ci_upper  # Bootstrap stability — Pydantic field + TypedDict, consumed via JSON
bootstrap  # AnalysisResult.bootstrap, consumed by frontend (TypeScript) only
significance
factor
variance_explained
cumulative_variance
avg_rel_coef
composite_reliability
se_factor_scores
total_variance_explained
rotated_loadings
factor_characteristics
suggested_n_factors
flagged_factors

# AnalysisRun + audit-trail endpoints (app/routers/admin/analysis.py)
list_analysis_runs
get_analysis_run
update_analysis_run
delete_analysis_run
list_audios_for_participants
ran_by_email

# Data-lifecycle endpoints + Pydantic field hooks (app/routers/admin/lifecycle.py)
get_data_inventory
bulk_anonymise_old_participants
total_mb
completed_older_than_1y
completed_older_than_2y
generated_at
timeline
locales
skipped_already_anonymous

# RGPD erasure endpoints
admin_erase_participant_personal_data
participant_self_erase_personal_data

# --- app/types/wire.py (TypedDict wire shapes — fields used at JSON boundary) ---
# StepHelpEntry — what/why pair surfaced in DEFAULT_TRANSLATION_CONTENT
what
why
# DeviceBreakdown — study stats device split
mobile
desktop

# --- app/services/analysis_service.py (intermediate scientific values) ---
# GridSlot — TypedDict consumed by build_sort_matrix wire boundary
GridSlot
# Loop bookkeeping retained for clarity of stat indices
statement_idx
# Outputs of factor_analyzer kept for parity with reference R kit even
# when downstream consumers prefer rotated forms
unrotated_loadings
factor_correlation

# --- app/services/export_service.py ---
# Reported in export manifest for human review
size_kb

# --- app/routers/admin/analysis.py (G1: card_comment endpoint) ---
list_comments_for_participants

# --- app/schemas/analysis.py (G2: factor_notes Pydantic field_validator + ParticipantCardComment field) ---
validate_factor_notes
statement_text

# --- app/schemas/responses.py (Pydantic response model fields, used at JSON boundary) ---
usage_percent
backup_codes
already_submitted
