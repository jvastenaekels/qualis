# GDPR responsibility model

This explanation describes why responsibility remains with the institution operating
Qualis and how the self-hosted architecture shapes its compliance work. It is not legal
advice.

## Roles

- The **operator** determines the purposes and means of processing and normally acts as
  data controller for participant data.
- The **Qualis maintainers** publish software but do not receive an operator's participant
  traffic or production credentials merely because the operator runs Qualis.
- Hosting, object-storage, and email providers process data according to the services an
  operator enables; the operator evaluates contracts, regions, and transfer mechanisms.
- Researchers are authorized users whose project roles constrain application access.

## Trust boundaries

Participant traffic reaches the operator's frontend and API, then the operator's
PostgreSQL database. Audio reaches the configured S3-compatible service, and account or
invitation email reaches the configured SMTP provider. No Qualis-maintainer service is
required in this request path.

This means self-hosting provides control over residency and processors, but it also puts
retention, backups, logging, breach response, and subject-rights procedures in the
operator's hands.

## Data lifecycle

Qualis distinguishes an active participant record from discarded, anonymized, and
erased states. Anonymization is designed to remove or rotate identifying session fields
while preserving research data that is no longer personal under the operator's context.
The operator must still assess free text, audio, small cohorts, and linkage data, because
application-level anonymization cannot determine whether research content identifies a
person in a particular study.

## Why consent configuration is not enough

The application records a hash of the consent text shown, but a technical record does not
select a lawful basis, establish valid consent, or define retention. Those decisions come
from the study protocol and the operator's governance process.

For exact fields and controls, consult the [controls reference](../reference/gdpr-controls.md).
For concrete operator actions, use the [operations guide](../guides/gdpr-operations.md).
