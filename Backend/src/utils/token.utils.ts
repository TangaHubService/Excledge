import crypto from 'crypto';
import { addHours } from 'date-fns';
import jwt from 'jsonwebtoken';

export const generateToken = (): string => {
    return crypto.randomBytes(32).toString('hex');
};

export const generateVerificationToken = () => {
    // Generate a 6-digit code
    const token = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = addHours(new Date(), 24); // Token expires in 24 hours
    return { token, expires };
};



export const generatePasswordResetToken = (email: string) => {
    const token = jwt.sign({ email }, process.env.JWT_SECRET as string, { expiresIn: '1h' });
    return { token };
};

export const isTokenExpired = (expiryDate: Date | null): boolean => {
    if (!expiryDate) return true;
    return new Date() > expiryDate;
};
