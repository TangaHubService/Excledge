import axios from "axios";
import { paypackConfig, pesapalConfig } from "../lib/paypack";

export interface PaypackToken {
    access: string;
    refresh: string;
    expires: string;
}

export const getAccessToken = async (): Promise<PaypackToken> => {
    const { data } = await axios.post<PaypackToken>(
        `${paypackConfig.baseUrl}/auth/agents/authorize`,
        {
            client_id: paypackConfig.clientId,
            client_secret: paypackConfig.clientSecret,
        },
        { headers: { "Content-Type": "application/json", Accept: "application/json" } }
    );
    return data;
}


export const pesapalToken = async () => {
    const tokenUrl = process.env.PESAPAL_API_URL;

    const { data } = await axios.post(
        `${tokenUrl}/api/Auth/RequestToken`,
        {
            consumer_key: pesapalConfig.consumerKey,
            consumer_secret: pesapalConfig.consumerSecret,
        },
        {
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
            }
        }
    );

    return data;
};
