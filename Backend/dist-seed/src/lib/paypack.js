"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pesapalConfig = exports.paypackConfig = void 0;
exports.paypackConfig = {
    clientId: process.env.PAYPACK_CLIENT_ID,
    clientSecret: process.env.PAYPACK_CLIENT_SECRET,
    baseUrl: process.env.PAYPACK_BASE_URL,
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'development'
};
if (!exports.paypackConfig.clientId || !exports.paypackConfig.clientSecret) {
    console.warn('Paypack client ID or secret not set. Paypack payments will not work.');
}
exports.pesapalConfig = {
    consumerKey: process.env.PESAPAL_CONSUMER_KEY,
    consumerSecret: process.env.PESAPAL_CONSUMER_SECRET,
};
