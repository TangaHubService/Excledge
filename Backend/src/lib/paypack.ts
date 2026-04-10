export const paypackConfig = {
    clientId: process.env.PAYPACK_CLIENT_ID!,
    clientSecret: process.env.PAYPACK_CLIENT_SECRET!,
    baseUrl: process.env.PAYPACK_BASE_URL!,
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'development'
};

if (!paypackConfig.clientId || !paypackConfig.clientSecret) {
    console.warn('Paypack client ID or secret not set. Paypack payments will not work.');
}


export const pesapalConfig ={
    consumerKey:process.env.PESAPAL_CONSUMER_KEY!,
    consumerSecret:process.env.PESAPAL_CONSUMER_SECRET!,
}