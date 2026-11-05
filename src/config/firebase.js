
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');

const serviceAccount = require('../../instawash-7fa6a-firebase-adminsdk-fbsvc-1669e50170.json');

const firebaseApp = getApps().length
    ? getApps()[0]
    : initializeApp({
        credential: cert(serviceAccount)
    });

const messaging = getMessaging(firebaseApp);

module.exports = {
    messaging
};
