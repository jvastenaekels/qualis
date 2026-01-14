# type: ignore
# ruff: noqa: F821, D100
health_check  # unused function (backend/app/main.py:95)
serve_spa  # unused function (backend/app/main.py:123)
read_root  # unused function (backend/app/main.py:136)
active  # unused variable (backend/app/models.py:33)
paused  # unused variable (backend/app/models.py:34)
closed  # unused variable (backend/app/models.py:35)
archived  # unused variable (backend/app/models.py:36)
collaborations  # unused variable (backend/app/models.py:66)
created_at  # unused variable (backend/app/models.py:89)
added_at  # unused variable (backend/app/models.py:130)
added_by  # unused variable (backend/app/models.py:141)
StatementTranslation  # unused class (backend/app/models.py:193)
statement  # unused variable (backend/app/models.py:205)
statement  # unused variable (backend/app/models.py:264)
export_csv  # unused function (backend/app/routers/admin/exports.py:24)
export_pqmethod  # unused function (backend/app/routers/admin/exports.py:60)
create_study  # unused function (backend/app/routers/admin/studies.py:27)
list_studies  # unused function (backend/app/routers/admin/studies.py:70)
get_study  # unused function (backend/app/routers/admin/studies.py:86)
update_study  # unused function (backend/app/routers/admin/studies.py:98)
change_study_state  # unused function (backend/app/routers/admin/studies.py:124)
delete_study  # unused function (backend/app/routers/admin/studies.py:137)
list_collaborators  # unused function (backend/app/routers/admin/studies.py:151)
_.user_email  # unused attribute (backend/app/routers/admin/studies.py:166)
add_collaborator  # unused function (backend/app/routers/admin/studies.py:171)
_.user_email  # unused attribute (backend/app/routers/admin/studies.py:206)
remove_collaborator  # unused function (backend/app/routers/admin/studies.py:210)
list_users  # unused function (backend/app/routers/admin/users.py:26)
create_user  # unused function (backend/app/routers/admin/users.py:36)
delete_user  # unused function (backend/app/routers/admin/users.py:63)
login_for_access_token  # unused function (backend/app/routers/auth.py:20)
report_log  # unused function (backend/app/routers/logs.py:30)
submit_study  # unused function (backend/app/routers/submissions.py:14)
get_study  # unused function (backend/app/routers/submissions.py:28)
token_type  # unused variable (backend/app/schemas.py:20)
model_config  # unused variable (backend/app/schemas.py:48)
model_config  # unused variable (backend/app/schemas.py:73)
model_config  # unused variable (backend/app/schemas.py:94)
model_config  # unused variable (backend/app/schemas.py:116)
user_email  # unused variable (backend/app/schemas.py:131)
added_at  # unused variable (backend/app/schemas.py:133)
model_config  # unused variable (backend/app/schemas.py:135)
created_at  # unused variable (backend/app/schemas.py:186)
model_config  # unused variable (backend/app/schemas.py:193)
_.validate_qsort_structure  # unused method (backend/app/schemas.py:218)
_.validate_token  # unused method (backend/app/schemas.py:236)
_.validate_answers_dict  # unused method (backend/app/schemas.py:243)
API_V1_STR  # unused variable (backend/app/core/config.py:11)
PROJECT_NAME  # unused variable (backend/app/core/config.py:12)
DATABASE_URL  # unused variable (backend/app/core/config.py:22)
APIClient  # unused class (backend/app/utils/script_utils.py:9)
_.login  # unused method (backend/app/utils/script_utils.py:35)
_.close  # unused method (backend/app/utils/script_utils.py:52)
_.transform_study_data  # unused method (backend/app/utils/script_utils.py:56)
sync_study_from_file
consented_at
members
joined_at
memberships
WorkspaceRead
WorkspaceCreate
read_users_me
get_study_dump
get_study_stats
discard_participant
list_study_participants
check_grid_symmetry
median_duration_seconds
is_discarded
discard_reason
created_at
user_agent
get_participant
export_r_kit
study_collaborations
collaborators
invite_collaborator
verify_invitation
register_user
list_workspaces
create_workspace
branding
ui_labels
consent_title
consent_description
consent_accept
consent_decline
random_seed
logo_url
accent_color
update_user_me  # unused function (backend/app/routers/auth.py)
change_password  # unused function (backend/app/routers/auth.py)
full_name  # unused variable
individual
limited
recruitment_links
start_count
Invitation
accepted_at
list_study_links
create_recruitment_links
revoke_recruitment_link
setup_totp
enable_totp
disable_totp
unlock_study
requires_2fa
temp_token
qr_code_uri
recruitment_token
condition_of_instruction

get_workspace
update_workspace
list_workspace_members
update_workspace_member
remove_workspace_member
WorkspaceInvitationCreate

# New exceptions
IP_HASH_SALT
assemble_db_url
cls
effective_emails_from_name
requires_password
icon
partners
# New for Workspace Invitations/Workspaces
delete_workspace  # unused function (backend/app/routers/admin/workspaces.py)
create_invitation  # unused function (backend/app/routers/admin/workspaces.py)
user_role  # unused variable (backend/app/schemas.py)
config  # unused variable (backend/app/models.py)
color  # unused variable (backend/app/schemas.py)
InvitationCreate  # unused class (backend/app/schemas.py)
validate_study  # unused function (backend/app/routers/admin/studies.py)
SchemaValidationError  # unused class (backend/app/schema_validation.py)
# New for Study Invitations & Test Utils
accept_invitation
init_test_db
seed_test_data
add_test_member
cleanup_test_data
cleanup_all_test_data
symmetry_lock
primary_color
set_sqlite_pragma
connection_record
