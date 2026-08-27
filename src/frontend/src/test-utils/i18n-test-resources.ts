/*
 * Test-only i18n resource bundle. The real app loads via i18next-http-backend;
 * tests load synchronously from imported JSON.
 *
 * After the namespace split, each locale ships two files. Export both so that
 * unit tests can resolve any key the app code uses.
 */
import enParticipant from '../../public/locales/en/participant.json';
import enAdmin from '../../public/locales/en/admin.json';

const resources = {
    participant: enParticipant,
    admin: enAdmin,
};

export default resources;
