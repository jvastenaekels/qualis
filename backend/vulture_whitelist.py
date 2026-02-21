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
API_V1_STR
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

# admin/workspaces.py
list_workspaces
create_workspace
get_workspace
update_workspace
list_workspace_members
update_workspace_member
remove_workspace_member
delete_workspace
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
validate_comment
validate_reason
validate_name
pre_instruction
statement_code
url_expires_at

# Analysis schemas (app/schemas.py)
validate_draft

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
