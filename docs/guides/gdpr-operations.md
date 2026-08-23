# GDPR operations

Task-oriented checklist for operators responding to common data-protection needs in a
Qualis deployment. It is not legal advice; follow the procedure approved by your data
protection officer or legal counsel.

## Prepare a study

1. Identify controller contacts, purpose, lawful basis, participant categories, and data
   fields before activation.
2. Decide whether free text or audio is necessary and document the additional risk.
3. Select hosting, S3, and SMTP providers and regions; record applicable processor terms.
4. Set retention periods and assign an owner for anonymization and deletion.
5. Complete the [record-of-processing template](../reference/templates/record-of-processing.md).
6. Review the detailed [controls reference](../reference/gdpr-controls.md) against the
   actual deployment.

## Handle a participant request

1. Verify the requester's identity using an approved channel without collecting more data
   than necessary.
2. Locate the participant using the study and confirmation/recruitment information your
   protocol makes available.
3. Export, correct, anonymize, or erase data using the relevant participant controls.
4. Check connected S3 objects, recruitment linkage, backups, logs, and downstream exports;
   application database changes do not automatically rewrite external copies.
5. Record the request, decision, action, date, and reviewer outside participant-facing data.

## Apply retention

1. Review records reaching the documented cutoff.
2. Screen retained free text and audio for direct or contextual identifiers.
3. Run the approved anonymization or deletion action.
4. Confirm object-storage deletion and investigate warnings or orphaned objects.
5. Apply the separate retention rules for logs, backups, and exported research packages.

## Respond to a suspected breach

1. Contain access and preserve relevant evidence.
2. Determine affected systems, studies, fields, people, time window, and processors.
3. Assess likelihood and severity with the responsible privacy and security contacts.
4. Follow applicable notification deadlines and document the reasoning whether notification
   is required or not.
5. Remediate the cause, rotate exposed credentials where applicable, and verify recovery.

The [controls reference](../reference/gdpr-controls.md) contains the detailed field inventory,
software behavior, risks, and article-by-article notes used by these procedures.
